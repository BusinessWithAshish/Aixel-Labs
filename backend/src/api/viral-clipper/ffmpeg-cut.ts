import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS,
  VIRAL_CLIPPER_ERROR_MESSAGES,
} from "./constants";
import type { VIRAL_CLIPPER_ASPECT_RATIO_VALUE } from "./types";

const execFileAsync = promisify(execFile);

const DURATION_REGEX = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/;

/**
 * Reads a media file's duration by parsing ffmpeg's own stderr banner
 * (`Duration: HH:MM:SS.ms`) — avoids adding `ffprobe-static` as a second
 * binary dependency alongside `ffmpeg-static` just for this one number.
 * `ffmpeg -i <input>` with no output writes this and exits non-zero (no
 * output was requested), which is expected here — we only read stderr.
 */
export async function getMediaDurationSeconds(inputPath: string): Promise<number> {
  if (!ffmpegPath) {
    throw new Error(VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  let stderr = "";
  try {
    await execFileAsync(ffmpegPath, ["-i", inputPath]);
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? "";
  }

  const match = stderr.match(DURATION_REGEX);
  if (!match) {
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: could not read duration`);
  }
  const [, h, m, s, cs] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100;
}

/**
 * Builds a center-crop + scale `-vf` filter that reframes the source into
 * `aspectRatio` (e.g. a 16:9 landscape source -> 9:16 vertical output for
 * Shorts/Reels). `undefined` for "original" (no reframing — re-encode only).
 *
 * The crop width/height are ffmpeg expressions evaluated against the actual
 * decoded frame size (`iw`/`ih`), not a value precomputed in JS — so this
 * works without probing the source's resolution first. The two branches
 * compare via cross-multiplication (`iw*ratioH` vs `ih*ratioW`) rather than
 * `iw/ih > ratioW/ratioH`, which avoids float rounding and — critically —
 * avoids ffmpeg's left-to-right `/` chaining turning `iw/ratioW/ratioH` into
 * `(iw/ratioW)/ratioH` instead of the intended `iw*(ratioH/ratioW)`.
 * The crop filter's own w/h params are comma-separated `if(...)` expressions,
 * so each must be single-quoted or ffmpeg's filtergraph parser would treat
 * the inner commas as filter separators instead of function-argument commas.
 */
function buildAspectRatioFilter(
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
): string | undefined {
  if (aspectRatio === "original") return undefined;

  const { ratioW, ratioH, outputWidth, outputHeight } =
    VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const wider = `gt(iw*${ratioH},ih*${ratioW})`;
  const cropW = `if(${wider},ih*${ratioW}/${ratioH},iw)`;
  const cropH = `if(${wider},ih,iw*${ratioH}/${ratioW})`;
  return `crop='${cropW}':'${cropH}',scale=${outputWidth}:${outputHeight},setsar=1`;
}

/**
 * Cuts an audio-only segment (no video, no aspect-ratio filter) — used for
 * splitting a long source audio file into diarization chunks and for
 * extracting short per-speaker reference clips (see `diarize.ts`). `-ss`
 * before `-i` (fast, keyframe-snapped) is fine here: unlike `cutClip`'s
 * output (a final deliverable), this audio is only ever fed back into
 * Gemini as an upload, so a fraction-of-a-second imprecision at the edges
 * doesn't matter.
 */
export async function cutAudioSegment(
  inputPath: string,
  startSeconds: number,
  durationSeconds: number,
  outputPath: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-ss",
      startSeconds.toFixed(3),
      "-i",
      inputPath,
      "-t",
      durationSeconds.toFixed(3),
      "-vn",
      "-c:a",
      VIRAL_CLIPPER.FFMPEG_AUDIO_CODEC,
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${message}`);
  }
}

/**
 * Cuts one clip via re-encode (not stream-copy). `-ss`/`-to` before `-i`
 * would be fast but only seeks to the nearest keyframe — for clips this
 * short (<=120s) a full re-encode costs a couple seconds and completely
 * eliminates keyframe-boundary glitches (black frames / A-V desync) that
 * `-c copy` cuts are prone to at arbitrary cut points. Reframing (crop+scale
 * to `aspectRatio`) rides along on the same re-encode at no extra pass.
 */
export async function cutClip(
  inputPath: string,
  startSeconds: number,
  endSeconds: number,
  outputPath: string,
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  const videoFilter = buildAspectRatioFilter(aspectRatio);

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      "-ss",
      startSeconds.toFixed(3),
      "-to",
      endSeconds.toFixed(3),
      ...(videoFilter ? ["-vf", videoFilter] : []),
      "-c:v",
      VIRAL_CLIPPER.FFMPEG_VIDEO_CODEC,
      "-preset",
      VIRAL_CLIPPER.FFMPEG_PRESET,
      "-crf",
      VIRAL_CLIPPER.FFMPEG_CRF,
      "-c:a",
      VIRAL_CLIPPER.FFMPEG_AUDIO_CODEC,
      "-avoid_negative_ts",
      "make_zero",
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${message}`);
  }
}
