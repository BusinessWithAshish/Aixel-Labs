import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { TIGHTENING, TIGHTENING_ERROR_MESSAGES } from "./constants";
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
 * Renders the keep-list into a single video.
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
 * The identical time expression drives both the video and audio chains, which
 * is what guarantees the two stay in sync no matter how many cuts there are.
 *
 * The filtergraph goes to a FILE via `-filter_complex_script`, not an argv
 * string: at a few thousand ranges the expression runs to hundreds of
 * kilobytes and would blow past the OS argument-length limit.
 */
export async function assembleKeepRanges(
  inputPath: string,
  keeps: TIME_RANGE[],
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(TIGHTENING_ERROR_MESSAGES.FFMPEG_FAILED);
  }

  const expression = buildSelectExpression(keeps);
  const filterGraph = [
    `[0:v]select='${expression}',setpts=N/FRAME_RATE/TB[v]`,
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
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        TIGHTENING.FFMPEG_VIDEO_CODEC,
        "-preset",
        TIGHTENING.FFMPEG_PRESET,
        "-crf",
        TIGHTENING.FFMPEG_CRF,
        "-c:a",
        TIGHTENING.FFMPEG_AUDIO_CODEC,
        // Put the moov atom up front so the result streams/scrubs immediately.
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
    throw new Error(`${TIGHTENING_ERROR_MESSAGES.FFMPEG_FAILED}: ${detail}`);
  }
}
