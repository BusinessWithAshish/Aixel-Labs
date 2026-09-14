import { resolve } from "node:path";

import { AIXEL_MEDIA } from "../../media";

/**
 * Video module — single source of truth for Gemini wiring, prompts, and limits.
 * Diarization (audio -> speaker-labeled transcript) and viral-moment scoring
 * (transcript -> candidate short-form clips) both go through Gemini's
 * generateContent + structured-output (responseSchema) surface.
 */

export const MEDIA_FIELD_DESCRIPTIONS = {
  sharePath:
    "Absolute path of a file this backend produced under the private media root (e.g. a `caption` or `cut` output).",
  mediaSource:
    "Local filesystem path to the audio or video file to diarize (this pipeline runs on the VPS and reads files directly off disk), or a publicly-reachable audio/video URL. Video input is fine — only the audio track is ever uploaded to Gemini. Not for YouTube links: use `youtube` op=diarize for the free captions path, or `youtube` op=video_download then pass the resulting local path here.",
  videoUrl:
    "YouTube watch/share URL or video id. Uses that video's captions (ASR `>>` turn marks or authored Name: labels) instead of Gemini audio diarization. Mutually exclusive with audioSource.",
  language: "Caption language (BCP-47). Only used with videoUrl. Defaults to en.",
  model:
    "Optional Gemini model override. Used for audio diarization and for labeling YouTube-caption turns (no audio upload).",
  speakerCount:
    "Optional hint for how many distinct people are talking (2–8). Only used with videoUrl ASR captions. Omit to let the model infer.",
  diarized: "Diarized transcript object, as returned by POST /video/diarize.",
  source:
    "Media to resolve to a local file: a local filesystem path (returned as-is), or any publicly-reachable media URL (downloaded). Not for YouTube links — use `youtube` op=video_download for those and pass this the resulting local path instead; a YouTube URL given here is just a URL and will fail to resolve as one.",
  fetchImageOnly:
    "Reject the download unless the response is a real image content-type (jpeg/png/webp/gif) — for staging a reference image (e.g. a competitor's post) to view or attach elsewhere, where silently saving a login-wall HTML page or an unusable format is worse than a clear error. Omit for a plain media fetch with no content-type check.",
  fetchMaxBytes:
    "Reject the download if it exceeds this many bytes. Checked against Content-Length up front when the server sends one, and against the actual file size after writing either way. Omit for no limit.",
  videoSource:
    "Local filesystem path to the SOURCE VIDEO (not audio-only) to cut clips from, or a publicly-reachable video URL — cutting needs the real video stream.",
  clips: "List of time ranges to cut — `{ start, end, label? }` — start/end as seconds (number, e.g. 1082) or an HH:MM:SS / MM:SS timestamp string. Any source of ranges works; nothing here is tied to a particular scorer.",
  diarizedForSnap:
    "Optional diarized transcript — when provided, each clip's start/end is snapped to the nearest real speech-segment boundary so cuts don't land mid-word. Omit to cut at the raw timestamps plus fixed padding only.",
  minClipSeconds: "Minimum candidate clip length in seconds.",
  maxClipSeconds:
    "Maximum candidate clip length in seconds — defaults to 60 (Shorts/Reels length). Raise this if you specifically want longer YouTube-Shorts-style clips, up to MEDIA.MAX_CLIP_SECONDS.",
  channelContext:
    "Optional free-text description of the channel/show and its audience (e.g. niche, tone, typical audience) — used to weight which moments and hook_types fit this audience. Omit to use the generic (still high-quality) default.",
  audienceSignals:
    "Optional pre-fetched, pre-formatted lines of real audience behavior on this exact episode — e.g. from the youtube module's comments-intel timestamp clusters and/or video chapters, formatted via its audience-signal formatters — used to bias candidate selection toward moments viewers/the creator already flagged. Fetch those yourself first; this field just takes the output.",
  aspectRatio:
    "Output aspect ratio for cut clips: '9:16' (Shorts/Reels/TikTok, default), '16:9' (YouTube/landscape), '1:1' (square), or 'original' (no crop, keep source framing). Cropping is centered on the source frame.",
  reframe:
    "How a cut clip is framed when aspectRatio crops the source: 'center' (default) keeps the fixed centre crop; 'speaker' follows whoever is talking — camera cuts, face tracking and LR-ASD lip-sync (each face's lip motion matched to the audio) choose the face for each stretch, and the crop cuts on speech onsets. Slower: about 50 s of CPU per clip. Needs the reframe worker installed on this host (backend/workers/reframe); when it cannot run or finds no faces the clip still gets the centre crop and `reframe.fallbackReason` says why. Ignored for audio sources and for aspectRatio 'original'.",
  captionVideoSource:
    "Local filesystem path to the video to caption — normally an already-cut clip, not a full episode. A publicly-reachable video URL also works.",
  captionSubtitles:
    "Optional SRT or VTT to burn in: either the subtitle text itself, or a local path to a .srt/.vtt file. OMIT THIS for the normal case — the clip's own audio is transcribed instead, which is both more accurate and already timed from zero. Only pass this when you have subtitles that must be used verbatim; timings are taken as-is and are assumed to be relative to the start of THIS video, not the episode it was cut from.",
  captionStyle:
    "Optional appearance overrides. Defaults are tuned for a 1080x1920 vertical Short: white bold text, heavy black outline, positioned in the middle band so the platform's own UI (which covers the bottom third) does not sit on top of it.",
  captionWrap:
    "Optional line-breaking overrides. Whisper returns long unbroken segments; they are re-wrapped into short lines so captions stay readable on a phone. Defaults: 32 characters per line, 2 lines on screen at once.",
  captionBurn:
    "Burn the captions into the video (default true). Set false to only generate the .srt sidecar and skip re-encoding — useful when you want to review or edit the text before committing to a render.",
} as const;

export const MEDIA_GEMINI_MODEL = {
  /** Stable GA flash-tier model — used for both diarization (audio) and viral-moment scoring (text). */
  DEFAULT: "gemini-3.5-flash",
} as const;

/** Supported output framings for `/video/cut`. */
export const MEDIA_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "original"] as const;

/** How `/video/cut` frames a cropped clip: fixed centre, or follow the speaker. */
export const MEDIA_REFRAME_MODES = ["center", "speaker"] as const;

/**
 * Target pixel dimensions + integer width:height ratio per aspect ratio.
 * Ratios are kept as separate integers (not a precomputed float) so the
 * ffmpeg crop expression built in `ffmpeg-cut.ts` can compare
 * `iw*ratioH` vs `ih*ratioW` — cross-multiplication avoids any float
 * rounding / division-chain-order bugs in ffmpeg's own expression evaluator.
 */
export const MEDIA_ASPECT_RATIO_DIMENSIONS = {
  "9:16": { ratioW: 9, ratioH: 16, outputWidth: 1080, outputHeight: 1920 },
  "16:9": { ratioW: 16, ratioH: 9, outputWidth: 1920, outputHeight: 1080 },
  "1:1": { ratioW: 1, ratioH: 1, outputWidth: 1080, outputHeight: 1080 },
} as const;

/**
 * Speaker reframe (`cut` with `reframe: "speaker"`). Analysis is a Python
 * worker (`backend/workers/reframe`, set up with `pnpm setup:reframe`)
 * spawned once per clip; rendering stays in ffmpeg here — see `cut/reframe.ts`.
 */
export const MEDIA_REFRAME = {
  DEFAULT_MODE: "center" as const,
  /** `src/api/media` and `dist/api/media` are both three levels below `backend/`. */
  WORKER_DIR: process.env.REFRAME_WORKER_DIR || resolve(__dirname, "../../../workers/reframe"),
  /** Empty = `<WORKER_DIR>/.venv/bin/python`. */
  PYTHON_BIN: process.env.REFRAME_PYTHON || "",
  /** Empty = the worker's own `models/` folder. */
  MODELS_DIR: process.env.REFRAME_MODELS_DIR || "",
  /** Per clip. A 60 s clip plans in about a minute; this only guards a hung worker. */
  WORKER_TIMEOUT_MS: 15 * 60 * 1000,
  WORKER_MAX_BUFFER_BYTES: 32 * 1024 * 1024,
} as const;

export const MEDIA = {
  /** Gemini inline-request cap is ~20MB; anything at/above this always goes through the File API. */
  INLINE_AUDIO_MAX_BYTES: 20 * 1024 * 1024,
  /** Gemini's documented audio-per-prompt ceiling. */
  MAX_AUDIO_DURATION_SECONDS: 9.5 * 60 * 60,
  FILE_ACTIVE_POLL_INTERVAL_MS: 3000,
  FILE_ACTIVE_POLL_MAX_ATTEMPTS: 60,
  /**
   * Retry/key-pool policy (see `withGeminiKeyPoolRetry` in gemini-client.ts).
   * `GEMINI_API_KEY_FREE` may be a comma-separated list of keys — on a
   * daily-quota-exhausted error (confirmed via Gemini's own structured
   * error, quotaId containing "PerDay") the pool moves to the next key
   * immediately, since retrying the same key can't help until the quota
   * resets. On other transient errors (network blips, 5xx, non-daily 429),
   * it retries the SAME key up to this many times with exponential backoff
   * before giving up on that key and moving to the next.
   */
  GEMINI_MAX_ATTEMPTS_PER_KEY: 3,
  GEMINI_RETRY_BASE_DELAY_MS: 2000,
  GEMINI_RETRY_MAX_DELAY_MS: 15000,
  /** Hard validation bounds — callers can request anywhere in this range. */
  MIN_CLIP_SECONDS: 15,
  MAX_CLIP_SECONDS: 120,
  /** Defaults used when a caller doesn't specify — tuned for Shorts/Reels, not long-form YouTube clips. */
  DEFAULT_MIN_CLIP_SECONDS: 15,
  DEFAULT_MAX_CLIP_SECONDS: 60,
  DEFAULT_MIN_CANDIDATES: 8,
  DEFAULT_MAX_CANDIDATES: 12,
  DEFAULT_ASPECT_RATIO: "9:16" as const,
  /**
   * Boundary-snap: if the nearest diarized-segment boundary is within this
   * many seconds of the LLM-suggested cut point, snap to it (cheap, and
   * guarantees the cut lands on a real gap between speaker turns rather than
   * mid-word). If the nearest boundary is farther away — i.e. the suggested
   * timestamp sits deep inside one long segment — snapping all the way back
   * would make the clip unexpectedly long, so we fall back to the suggested
   * timestamp plus fixed padding instead. Segments are speaker-turn-level,
   * not word-level, so this is a best-effort reduction of mid-word cuts, not
   * a guarantee — see video/README.md.
   */
  BOUNDARY_SNAP_MAX_DISTANCE_SECONDS: 3,
  /** Extra padding applied at the (possibly snapped) start/end so the very edge of speech isn't clipped. */
  CLIP_PADDING_SECONDS: 0.35,
  /** ffmpeg re-encode settings — clips are short (<=120s), so re-encoding is cheap and eliminates keyframe-boundary glitches entirely. */
  FFMPEG_VIDEO_CODEC: "libx264",
  FFMPEG_AUDIO_CODEC: "aac",
  FFMPEG_PRESET: "veryfast",
  FFMPEG_CRF: "20",
  /**
   * Diarization ceiling — confirmed empirically (2026-08-11) AND by
   * research: Gemini 3.5-flash's `maxOutputTokens` hard cap is 65536, that
   * cap is shared between "thinking" and visible-output tokens (not
   * separate budgets), and `thinkingLevel: "minimal"` is the lowest
   * settable level but can't reach zero (Gemini 3.x models always spend
   * some tokens on "thought signatures"). A 20-minute two-speaker
   * conversational chunk used ~46K of the 65536 combined budget; an
   * 80-minute single-call attempt still hit `finishReason=MAX_TOKENS` even
   * with minimal thinking. This is a hard per-call ceiling, not a tuning
   * parameter — long episodes are split into sequential chunks instead
   * (see `diarize.ts`).
   */
  CHUNK_DURATION_SECONDS: 15 * 60,
  /**
   * Only chunk audio longer than this. Kept below CHUNK_DURATION_SECONDS
   * so a slightly-over-one-chunk episode (e.g. 16 minutes) still gets a
   * single, simpler, non-chunked call instead of a wasteful 2-chunk split.
   */
  CHUNK_THRESHOLD_SECONDS: 18 * 60,
  /**
   * Length of the short reference clip extracted per known speaker and fed
   * into each subsequent chunk's prompt so Gemini can voice-match and keep
   * the same speaker_N id across chunks (see the continuation prompt in
   * this file). Long enough to carry a real voice fingerprint, short
   * enough to stay cheap to upload/process per chunk.
   */
  REFERENCE_CLIP_SECONDS: 7,
  /** Safety cap on how many distinct speakers' reference clips get carried into a continuation chunk's prompt. */
  MAX_REFERENCE_SPEAKERS: 6,
} as const;

export const MEDIA_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const MEDIA_ERROR_MESSAGES = {
  SHARE_NOT_FOUND: "share: no such file",
  SHARE_OUTSIDE_ROOT: "share: path must be under the private media root (a file this backend produced)",
  SHARE_NOT_A_FILE: "share: not a file",
  INVALID_PARAMS: "Invalid request parameters",
  MISSING_API_KEY: "GEMINI_API_KEY_FREE is not configured",
  DOWNLOAD_FAILED: "Failed to resolve source media",
  GEMINI_UPLOAD_FAILED: "Gemini file upload failed",
  GEMINI_FILE_NOT_ACTIVE: "Gemini file never became ACTIVE in time",
  GEMINI_REQUEST_FAILED: "Gemini generateContent request failed",
  GEMINI_EMPTY_RESPONSE: "Gemini returned no content",
  GEMINI_TRUNCATED_RESPONSE: "Gemini response was cut off before completing",
  GEMINI_MALFORMED_RESPONSE: "Gemini response did not match the expected shape",
  GEMINI_KEY_POOL_EXHAUSTED: "All Gemini API keys failed or are exhausted",
  FFMPEG_CUT_FAILED: "ffmpeg failed to cut clip",
  REFRAME_WORKER_MISSING:
    "Speaker reframe worker is not installed on this host (run `pnpm setup:reframe` in backend)",
  REFRAME_WORKER_FAILED: "Speaker reframe worker failed",
  REFRAME_PLAN_INVALID: "Speaker reframe worker returned an unreadable plan",
  REFRAME_NO_PLAN: "Speaker reframe worker kept the centre crop",
  FFMPEG_REFRAME_FAILED: "ffmpeg failed to render the speaker-reframed clip",
  GENERIC: "Media operation failed",
  VERCEL:
    "The cut op needs a persistent host with local disk output (not available on Vercel)",
  LOCAL_PATH_ON_VERCEL:
    "A local filesystem path was given, but this is running on Vercel (no shared filesystem) — pass a URL instead",
  FETCH_NOT_IMAGE:
    "imageOnly was set but the source did not return a real image content-type",
  FETCH_TOO_LARGE: "Downloaded file exceeded maxBytes",
  CAPTION_NO_AUDIO:
    "The source has no audio track, so there is nothing to transcribe — pass `subtitles` explicitly to caption a silent video",
  CAPTION_NO_VIDEO:
    "The source has no video track — captions can only be burned into a video",
  CAPTION_EMPTY:
    "Transcription produced no usable cues (silent or unintelligible audio) — no caption file was written",
  CAPTION_BURN_FAILED: "ffmpeg failed to burn in captions",
  CAPTION_SUBTITLE_PARSE_FAILED:
    "Could not parse the supplied `subtitles` as SRT or VTT",
} as const;

/** HTTP statuses treated as "this source is blocking a plain fetch" — triggers the TLS-fingerprint fallback in source.ts. */
export const MEDIA_GATED_STATUS_CODES = [401, 403, 429, 503] as const;

/**
 * Extensions `media.fetch` will name a downloaded file with when the
 * response's content-type matches — otherwise the file is left unnamed
 * (no extension), same as always. Deliberately just the common image types:
 * `imageOnly` REQUIRES a match from this set (unmatched = rejected, not
 * just unnamed); a plain fetch only uses it as an opportunistic nicety.
 */
export const MEDIA_FETCH_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MEDIA_CUT_OUTPUT_DIR = AIXEL_MEDIA.MEDIA_CUTS;

export const MEDIA_CAPTION_OUTPUT_DIR = AIXEL_MEDIA.MEDIA_CAPTIONS;

/** `share` — public copies live here; /home/ubuntu/media/prune.sh deletes them after RETENTION_DAYS. */
export const MEDIA_SHARE = {
  PUBLIC_DIR: AIXEL_MEDIA.PUBLIC,
  PUBLIC_BASE_URL: AIXEL_MEDIA.PUBLIC_BASE_URL,
  PUBLIC_RETENTION_DAYS: 7,
} as const;

/**
 * Caption defaults, tuned for a 1080x1920 vertical Short.
 *
 * `position` maps to a libass alignment rather than a raw pixel offset so the
 * common cases stay resolution-independent: `middle` is alignment 5 (true
 * vertical centre, no margin arithmetic), while `lower-third`/`bottom` are
 * alignment 2 (bottom-centre) plus a margin measured up from the bottom edge.
 * Those two margins ARE in source pixels and assume a 1920-tall frame — pass
 * `style.marginV` explicitly for anything else.
 *
 * Why the default is `middle`: YouTube Shorts, Reels and TikTok all overlay
 * their own chrome (title, handle, action rail) across the bottom of the
 * frame. Bottom-anchored captions are the single most common way a clip ships
 * unreadable.
 */
export const MEDIA_CAPTION = {
  DEFAULT_FONT_NAME: "DejaVu Sans",
  /**
   * No default font SIZE: an absolute pixel size that suits 1080x1920 is
   * wrong for every other frame. Omitting `style.fontSize` scales the text to
   * this fraction of the frame height instead (~4.5%, the band commercial
   * Shorts captions sit in). An explicit `fontSize` is honoured verbatim, in
   * real source pixels — see `ass.ts` on why that is now meaningful.
   */
  FONT_SIZE_HEIGHT_RATIO: 0.045,
  DEFAULT_PRIMARY_COLOUR: "#FFFFFF",
  DEFAULT_OUTLINE_COLOUR: "#000000",
  DEFAULT_OUTLINE: 3,
  DEFAULT_SHADOW: 0,
  DEFAULT_BOLD: true,
  DEFAULT_UPPERCASE: false,
  DEFAULT_POSITION: "middle" as const,
  /**
   * `middle` is libass alignment 5 (true vertical centre), so its margin is
   * irrelevant. The other two anchor to the bottom edge (alignment 2) with a
   * margin expressed as a FRACTION OF FRAME HEIGHT, so they hold at any
   * resolution. `style.marginV` overrides with absolute source pixels.
   */
  MARGIN_V_HEIGHT_RATIO: { middle: 0, "lower-third": 0.25, bottom: 0.04 },
  ALIGNMENT_BY_POSITION: { middle: 5, "lower-third": 2, bottom: 2 },
  /** Fallback frame size when ffmpeg's banner reported no dimensions. */
  FALLBACK_WIDTH: 1080,
  FALLBACK_HEIGHT: 1920,
  /**
   * No fixed default characters-per-line either: how many characters fit is a
   * function of frame width and font size, and a constant guess overflows the
   * frame the moment either changes. Omitting `wrap.maxCharsPerLine` derives
   * it from the usable width instead.
   *
   * `CHAR_WIDTH_RATIO` is the mean glyph advance as a fraction of font size —
   * ~0.55 for DejaVu Sans Bold and close enough for any humanist sans. It only
   * has to be good enough to pick a line length; `WrapStyle: 0` in the ASS
   * header re-wraps anything that still overflows rather than clipping it.
   */
  CHAR_WIDTH_RATIO: 0.55,
  MARGIN_H_WIDTH_RATIO: 0.05,
  DEFAULT_MAX_LINES_PER_CUE: 2,
  /** Hard bounds so a bad style value can't produce an unrenderable or absurd result. */
  MIN_FONT_SIZE: 8,
  MAX_FONT_SIZE: 200,
  MIN_CHARS_PER_LINE: 8,
  MAX_CHARS_PER_LINE: 120,
  MAX_LINES_PER_CUE: 4,
  /** A cue shorter than this is padded out so a fast line is still readable. */
  MIN_CUE_SECONDS: 0.5,
} as const;

export const MEDIA_CAPTION_POSITIONS = ["middle", "lower-third", "bottom"] as const;

/** Where `media.fetch` writes a genuine remote download — see AIXEL_MEDIA.MEDIA_FETCHED. */
export const MEDIA_FETCH_DIR = AIXEL_MEDIA.MEDIA_FETCHED;
