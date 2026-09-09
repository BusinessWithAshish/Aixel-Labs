import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_CONDENSE, MEDIA_CONDENSE_ERROR_MESSAGES } from "./constants";
import type { TIME_RANGE } from "./types";

const execFileAsync = promisify(execFile);

/**
 * Builds the `select` expression that keeps only the listed spans: a sum of
 * `between(t,start,end)` terms. The terms are disjoint by construction (they
 * come out of `invertToKeepRanges`), so the sum is only ever 0 or 1 — which is
 * exactly what `select` wants, since it keeps any frame whose expression is
 * non-zero.
 */
function buildSelectExpression(keeps: TIME_RANGE[]): string {
  return keeps
    .map(({ start, end }) => `between(t,${start.toFixed(3)},${end.toFixed(3)})`)
    .join("+");
}

/**
 * Renders the keep-list into a single file — video, or audio-only when
 * `hasVideo` is false (an audio source stays audio out; there's no video
 * stream to select/map/encode at all in that case).
 *
 * Uses `select`/`aselect` + `setpts`/`asetpts` rather than the more obvious
 * "N `trim` filters into a `concat`" graph. Both produce the same output, but
 * `concat` instantiates one input pad per range — with the hundreds or
 * thousands of ranges a full-length silence pass produces, that graph becomes
 * enormous and memory-hungry. `select` is a single filter evaluating one
 * arithmetic expression per frame, so its cost is flat in the number of ranges.
 * `setpts=N/FRAME_RATE/TB` (and `asetpts=N/SR/TB`) then renumbers the surviving
 * frames/samples from zero, which is what actually closes the gaps — without
 * it the dropped spans would come back as freezes.
 *
 * The identical time expression drives both chains when both exist, which is
 * what guarantees video and audio stay in sync no matter how many cuts there
 * are.
 *
 * The filtergraph goes to a FILE via `-filter_complex_script`, not an argv
 * string: at a few thousand ranges the expression runs to hundreds of
 * kilobytes and would blow past the OS argument-length limit.
 */
export async function assembleKeepRanges(
  inputPath: string,
  keeps: TIME_RANGE[],
  outputPath: string,
  hasVideo: boolean,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_CONDENSE_ERROR_MESSAGES.FFMPEG_FAILED);
  }

  const expression = buildSelectExpression(keeps);
  const filterGraph = [
    ...(hasVideo ? [`[0:v]select='${expression}',setpts=N/FRAME_RATE/TB[v]`] : []),
    `[0:a]aselect='${expression}',asetpts=N/SR/TB[a]`,
  ].join(";\n");

  const scriptPath = join(dirname(outputPath), "filtergraph.txt");
  await writeFile(scriptPath, filterGraph, "utf8");

  try {
    await execFileAsync(
      ffmpegPath,
      [
        "-y",
        "-hide_banner",
        "-nostats",
        "-i",
        inputPath,
        "-filter_complex_script",
        scriptPath,
        ...(hasVideo ? ["-map", "[v]"] : []),
        "-map",
        "[a]",
        ...(hasVideo
          ? [
              "-c:v",
              MEDIA_CONDENSE.FFMPEG_VIDEO_CODEC,
              "-preset",
              MEDIA_CONDENSE.FFMPEG_PRESET,
              "-crf",
              MEDIA_CONDENSE.FFMPEG_CRF,
            ]
          : []),
        "-c:a",
        MEDIA_CONDENSE.FFMPEG_AUDIO_CODEC,
        // Put the moov atom up front so the result streams/scrubs immediately
        // (valid for both the video mp4 and the audio m4a case — both are
        // MP4-family containers).
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (err) {
    const { stderr, message } = err as { stderr?: string; message?: string };
    // ffmpeg's real diagnostic is on stderr; `message` alone is just the exit code.
    const detail = stderr?.trim().split("\n").slice(-5).join(" | ") ?? message ?? "unknown error";
    throw new Error(`${MEDIA_CONDENSE_ERROR_MESSAGES.FFMPEG_FAILED}: ${detail}`);
  }
}
