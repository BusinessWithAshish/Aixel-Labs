import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { MEDIA_CONDENSE_ERROR_MESSAGES } from "./constants";
import type { TIME_RANGE } from "./types";

const execFileAsync = promisify(execFile);

/**
 * ffmpeg's own stderr banner (`Duration: HH:MM:SS.ms`) — parsed out of the
 * same run that does silence detection rather than spawning a separate probe,
 * and avoids adding `ffprobe-static` as a second binary dependency alongside
 * `ffmpeg-static` (same reasoning as `clipping/ffmpeg-cut.ts`).
 */
const DURATION_REGEX = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/;

/** `[silencedetect @ 0x...] silence_start: 12.345` */
const SILENCE_START_REGEX = /silence_start:\s*(-?[\d.]+)/g;
/** `[silencedetect @ 0x...] silence_end: 14.567 | silence_duration: 2.222` */
const SILENCE_END_REGEX = /silence_end:\s*(-?[\d.]+)/g;

/** `Stream #0:0: Video: ...` — same detection ffmpeg-cut.ts's probeMediaStreams uses, applied here to the stderr this call already captures rather than a separate probe run. */
const VIDEO_STREAM_REGEX = /Stream #\d+:\d+.*: Video:/;

export type SilenceScan = {
  durationSeconds: number;
  silences: TIME_RANGE[];
  /** Whether the source has a video stream at all — read off this same run's stderr, no extra ffmpeg spawn needed. */
  hasVideo: boolean;
};

/**
 * Runs ffmpeg's `silencedetect` filter over the source and returns every
 * stretch quieter than `thresholdDb` for longer than `minSilenceSeconds`,
 * plus the source duration and whether it has a video stream at all (all
 * three come out of the same stderr).
 *
 * `-vn` matters for speed, not correctness: `silencedetect` is an audio
 * filter, so decoding the video stream would be pure waste on what is already
 * a full-length pass over the file. `-f null -` discards the output — this run
 * exists only for its stderr. Stream enumeration happens during ffmpeg's
 * input analysis, before `-vn` (an output-side option) has any effect, so the
 * `Video:` line is still there in stderr even though the video stream itself
 * is never decoded.
 *
 * Deliberately detect-only. ffmpeg also ships a `silenceremove` filter that
 * would do the cutting in one step, but it's an audio filter: it shortens the
 * audio stream while leaving the video stream full-length, so the result
 * drifts progressively out of sync. Detecting here and cutting both streams
 * with one shared `select` expression (`assemble.ts`) is what keeps A/V
 * locked together.
 */
export async function detectSilences(
  inputPath: string,
  thresholdDb: number,
  minSilenceSeconds: number,
): Promise<SilenceScan> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_CONDENSE_ERROR_MESSAGES.FFMPEG_FAILED);
  }

  const filter = `silencedetect=noise=${thresholdDb}dB:d=${minSilenceSeconds}`;

  let stderr: string;
  try {
    const result = await execFileAsync(
      ffmpegPath,
      ["-hide_banner", "-nostats", "-i", inputPath, "-vn", "-af", filter, "-f", "null", "-"],
      /**
       * silencedetect prints one line per silence; a long, pause-heavy
       * recording can produce thousands. Node's default 1MB stdio buffer is
       * enough for roughly 10k lines, but raising it is free insurance against
       * an ENOBUFS kill partway through a full-length scan.
       */
      { maxBuffer: 64 * 1024 * 1024 },
    );
    stderr = result.stderr;
  } catch (err) {
    const { stderr: errStderr, message } = err as { stderr?: string; message?: string };
    /**
     * A non-zero exit with usable stderr still means the scan ran (ffmpeg
     * exits non-zero on some inputs it nonetheless decoded fully). Only treat
     * it as a hard failure if silencedetect never reported anything AND we
     * couldn't read a duration.
     */
    if (!errStderr || !DURATION_REGEX.test(errStderr)) {
      throw new Error(
        `${MEDIA_CONDENSE_ERROR_MESSAGES.SILENCE_DETECT_FAILED}: ${message ?? "unknown error"}`,
      );
    }
    stderr = errStderr;
  }

  const durationMatch = stderr.match(DURATION_REGEX);
  if (!durationMatch) {
    throw new Error(MEDIA_CONDENSE_ERROR_MESSAGES.PROBE_FAILED);
  }
  const [, h, m, s, cs] = durationMatch;
  const durationSeconds =
    Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100;

  const starts = [...stderr.matchAll(SILENCE_START_REGEX)].map((m2) => Number(m2[1]));
  const ends = [...stderr.matchAll(SILENCE_END_REGEX)].map((m2) => Number(m2[1]));

  const silences: TIME_RANGE[] = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = Math.max(0, starts[i]);
    /**
     * A file that ends mid-silence gets a `silence_start` with no matching
     * `silence_end` — ffmpeg has nothing to close it against. Clamp that final
     * open range to the source duration instead of dropping it, since trailing
     * dead air is exactly the kind of thing worth cutting.
     */
    const rawEnd = i < ends.length ? ends[i] : durationSeconds;
    const end = Math.min(durationSeconds, rawEnd);
    if (end > start) silences.push({ start, end });
  }

  return { durationSeconds, silences, hasVideo: VIDEO_STREAM_REGEX.test(stderr) };
}
