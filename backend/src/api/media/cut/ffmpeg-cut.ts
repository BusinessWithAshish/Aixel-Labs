import { execFile } from "node:child_process";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import {
  MEDIA,
  MEDIA_ASPECT_RATIO_DIMENSIONS,
  MEDIA_ERROR_MESSAGES,
} from "../constants";
import type { MEDIA_ASPECT_RATIO_VALUE } from "../types";

const execFileAsync = promisify(execFile);

const DURATION_REGEX = /Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/;
const VIDEO_STREAM_REGEX = /Stream #\d+:\d+.*: Video:/;
/** `, 1080x1920` on the video stream line. `[SAR .. DAR ..]` may follow; both are ignored — we want stored pixels. */
const VIDEO_SIZE_REGEX = /Stream #\d+:\d+.*: Video:.*?,\s*(\d{2,5})x(\d{2,5})/;
const AUDIO_STREAM_REGEX = /Stream #\d+:\d+.*: Audio:/;

export type MEDIA_STREAM_PROBE = {
  durationSeconds: number;
  hasVideo: boolean;
  hasAudio: boolean;
  /** Stored frame size, when the source has a video stream ffmpeg reported dimensions for. */
  width?: number;
  height?: number;
};

/**
 * Reads a media file's duration and which stream types it actually has, by
 * parsing ffmpeg's own stderr banner — the `Duration: HH:MM:SS.ms` line and
 * the `Stream #N:M: Video: ...` / `Stream #N:M: Audio: ...` lines ffmpeg
 * prints during input analysis, before any output option (like `-vn`) has a
 * chance to apply. Avoids adding `ffprobe-static` as a second binary
 * dependency alongside `ffmpeg-static` for what boils down to reading text
 * ffmpeg already writes for free. `ffmpeg -i <input>` with no output exits
 * non-zero (no output was requested) — expected here, we only read stderr.
 *
 * This is what makes `cut`/`condense` type-preserving: an audio-only source
 * (`hasVideo: false`) skips every video-specific step (aspect-ratio reframe,
 * video codec, `-map` of a video stream) rather than assuming one exists.
 */
/**
 * How many seconds of AUDIO the file really decodes to.
 *
 * The container's Duration follows the longest stream, which is the video, so a
 * truncated audio download is invisible to `probeMediaStreams`: seen in practice
 * as a 25.6s clip whose audio stopped at 14.2s — eleven seconds of pictures in
 * silence, written by an ffmpeg that exited 0. The stream-direct path maps video
 * and audio from two separate inputs, so either can die on its own.
 *
 * Decoding to null is the only way to get this from ffmpeg alone (no ffprobe in
 * ffmpeg-static), and it is cheap on a clip-length window.
 */
export async function probeAudioSeconds(inputPath: string): Promise<number | undefined> {
  if (!ffmpegPath) return undefined;
  let stderr = "";
  try {
    const out = await execFileAsync(ffmpegPath, ["-i", inputPath, "-map", "0:a:0", "-f", "null", "-"]);
    stderr = out.stderr ?? "";
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? "";
  }
  const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (times.length === 0) return undefined;
  const last = times[times.length - 1];
  return Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]);
}

export async function probeMediaStreams(inputPath: string): Promise<MEDIA_STREAM_PROBE> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  let stderr = "";
  try {
    await execFileAsync(ffmpegPath, ["-i", inputPath]);
  } catch (err) {
    stderr = (err as { stderr?: string }).stderr ?? "";
  }

  const match = stderr.match(DURATION_REGEX);
  if (!match) {
    throw new Error(`${MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: could not read duration`);
  }
  const [, h, m, s, cs] = match;
  const size = stderr.match(VIDEO_SIZE_REGEX);
  return {
    durationSeconds: Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(cs) / 100,
    hasVideo: VIDEO_STREAM_REGEX.test(stderr),
    hasAudio: AUDIO_STREAM_REGEX.test(stderr),
    width: size ? Number(size[1]) : undefined,
    height: size ? Number(size[2]) : undefined,
  };
}

/** Thin wrapper for the many callers that only need the duration. */
export async function getMediaDurationSeconds(inputPath: string): Promise<number> {
  return (await probeMediaStreams(inputPath)).durationSeconds;
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
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE,
  /**
   * Filters to run BEFORE the crop, on the full source frame — currently the
   * logo cover (see `cut/logo.ts`). It must come first: its coordinates are
   * source coordinates, and after the crop they would point somewhere else
   * entirely. Everything downstream of this pass then works on footage the
   * logo has already been taken out of, which is why the natural-boundary trim
   * and the speaker reframe need no knowledge of it at all.
   */
  prefix?: string,
): string | undefined {
  if (aspectRatio === "original") return prefix;

  const { ratioW, ratioH, outputWidth, outputHeight } =
    MEDIA_ASPECT_RATIO_DIMENSIONS[aspectRatio];
  const wider = `gt(iw*${ratioH},ih*${ratioW})`;
  const cropW = `if(${wider},ih*${ratioW}/${ratioH},iw)`;
  const cropH = `if(${wider},ih,iw*${ratioH}/${ratioW})`;
  const crop = `crop='${cropW}':'${cropH}',scale=${outputWidth}:${outputHeight},setsar=1`;
  return prefix ? `${prefix},${crop}` : crop;
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
    throw new Error(MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
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
      MEDIA.FFMPEG_AUDIO_CODEC,
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${message}`);
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
/**
 * `hasVideo` picks the branch: a video source gets the full treatment
 * (aspect-ratio reframe, video codec); an audio-only source skips every
 * video-specific flag entirely (`-vn`, audio codec only) rather than
 * assuming a video stream that isn't there — same shape `cutAudioSegment`
 * above already uses for its own narrower purpose.
 */
export async function cutClip(
  inputPath: string,
  startSeconds: number,
  endSeconds: number,
  outputPath: string,
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE,
  hasVideo: boolean,
  /** Short audio fades at the clip's edges, in seconds. Filters see the input's own timeline, so fade times are absolute. */
  fade?: { inSeconds: number; outSeconds: number },
  /** Source-coordinate filters to run before any crop — see `buildAspectRatioFilter`. */
  videoPrefix?: string,
  /** Local image the prefix pastes from, when a cover uses `replace`. */
  overlayImage?: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  const videoFilter = hasVideo ? buildAspectRatioFilter(aspectRatio, videoPrefix) : undefined;
  // A replacement image is a second input, and a second input means
  // `-filter_complex` with explicit labels rather than `-vf`.
  const complex = Boolean(videoFilter && overlayImage);
  const audioFilter = fade
    ? `afade=t=in:st=${startSeconds.toFixed(3)}:d=${fade.inSeconds},` +
      `afade=t=out:st=${Math.max(startSeconds, endSeconds - fade.outSeconds).toFixed(3)}:d=${fade.outSeconds}`
    : undefined;

  try {
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      inputPath,
      ...(complex && overlayImage ? ["-i", overlayImage] : []),
      "-ss",
      startSeconds.toFixed(3),
      "-to",
      endSeconds.toFixed(3),
      ...(hasVideo
        ? [
            ...(complex
              ? ["-filter_complex", `[0:v]${videoFilter}[v]`, "-map", "[v]", "-map", "0:a?"]
              : videoFilter
                ? ["-vf", videoFilter]
                : []),
            "-c:v",
            MEDIA.FFMPEG_VIDEO_CODEC,
            "-preset",
            MEDIA.FFMPEG_PRESET,
            "-crf",
            MEDIA.FFMPEG_CRF,
          ]
        : ["-vn"]),
      ...(audioFilter ? ["-af", audioFilter] : []),
      "-c:a",
      MEDIA.FFMPEG_AUDIO_CODEC,
      "-avoid_negative_ts",
      "make_zero",
      outputPath,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${message}`);
  }
}

/**
 * How far before the requested start ffmpeg fast-seeks (input-level, keyframe
 * snapped). The accurate output-level seek then recovers frame precision
 * within this window. Larger = fewer bytes re-downloaded at the keyframe
 * boundary; smaller = less extra proxy bandwidth. 3s is a good default for
 * typical keyframe intervals (2-5s on adaptive streams).
 */
const STREAM_DIRECT_FAST_SEEK_BACKUP_SECONDS = 3;

/**
 * Cuts one clip directly from two remote stream URLs (a video-only and an
 * audio-only adaptive googlevideo URL) with ffmpeg. `proxyUrl` is passed
 * as `-http_proxy` only when this host cannot fetch googlevideo directly
 * (VPS datacenter 403); otherwise ffmpeg hits the CDN with no proxy.
 *
 * Seek strategy: fast-seek each input to `max(0, start - backup)` (keyframe
 * snap, range request), then accurate-seek the output to the requested
 * start and limit duration. The accurate output seek runs after both
 * inputs are fast-seeked, so it applies to the mapped output timeline
 * (both inputs) — effective clip start = backup + (start - backup) =
 * start, frame-accurate. Re-encode (not stream-copy) keeps the same
 * quality as `cutClip` and carries the aspect-ratio filter.
 *
 * `proxyUrl` is optional — omitted when googlevideo is reachable from this
 * host (local/residential) or when Evomi isn't configured.
 */
export async function cutClipFromStream(
  videoUrl: string,
  audioUrl: string,
  startSeconds: number,
  endSeconds: string | number,
  outputPath: string,
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE,
  proxyUrl?: string,
  /** Source-coordinate filters to run before any crop — see `buildAspectRatioFilter`. */
  videoPrefix?: string,
  /** Local image the prefix pastes from, when a cover uses `replace`. */
  overlayImage?: string,
): Promise<void> {
  if (!ffmpegPath) {
    throw new Error(MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED);
  }

  const videoFilter = buildAspectRatioFilter(aspectRatio, videoPrefix);
  const fastSeek = Math.max(0, Number(startSeconds) - STREAM_DIRECT_FAST_SEEK_BACKUP_SECONDS);
  const accurateSeek = Number(startSeconds) - fastSeek;
  const duration = Number(endSeconds) - Number(startSeconds);

  const args: string[] = ["-y"];
  // Each input is optionally routed through the proxy and fast-seeked to
  // the keyframe just before the clip start.
  for (const url of [videoUrl, audioUrl]) {
    if (proxyUrl) args.push("-http_proxy", proxyUrl);
    args.push("-ss", fastSeek.toFixed(3), "-i", url);
  }
  // Accurate output-level seek recovers frame precision within the
  // fast-seek window; -t limits the output duration.
  // The image is a third input here (0 = video stream, 1 = audio stream), and
  // it must be added before the output-level seek options below.
  if (videoFilter && overlayImage) args.push("-i", overlayImage);
  args.push("-ss", accurateSeek.toFixed(3), "-t", duration.toFixed(3));
  if (videoFilter && overlayImage) {
    args.push("-filter_complex", `[0:v]${videoFilter}[v]`, "-map", "[v]", "-map", "1:a");
  } else {
    args.push("-map", "0:v", "-map", "1:a");
    if (videoFilter) args.push("-vf", videoFilter);
  }
  args.push(
    "-c:v", MEDIA.FFMPEG_VIDEO_CODEC,
    "-preset", MEDIA.FFMPEG_PRESET,
    "-crf", MEDIA.FFMPEG_CRF,
    "-c:a", MEDIA.FFMPEG_AUDIO_CODEC,
    "-avoid_negative_ts", "make_zero",
    outputPath,
  );

  try {
    await execFileAsync(ffmpegPath, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${MEDIA_ERROR_MESSAGES.FFMPEG_CUT_FAILED}: ${message}`);
  }
}
