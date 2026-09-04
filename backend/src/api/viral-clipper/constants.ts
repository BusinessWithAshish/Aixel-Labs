import { resolve } from "node:path";

import { AIXEL_MEDIA } from "../../media";

/**
 * Viral Clipper pipeline — single source of truth for Gemini wiring, prompts, and limits.
 * Diarization (audio -> speaker-labeled transcript) and viral-moment scoring
 * (transcript -> candidate short-form clips) both go through Gemini's
 * generateContent + structured-output (responseSchema) surface.
 */

export const VIRAL_CLIPPER_FIELD_DESCRIPTIONS = {
  audioSource:
    "Local filesystem path to the audio file to process (this pipeline runs on the VPS and reads files directly off disk), or a publicly-reachable audio URL. Mutually exclusive with videoUrl.",
  videoUrl:
    "YouTube watch/share URL or video id. Uses that video's captions (ASR `>>` turn marks or authored Name: labels) instead of Gemini audio diarization. Mutually exclusive with audioSource.",
  language: "Caption language (BCP-47). Only used with videoUrl. Defaults to en.",
  model:
    "Optional Gemini model override. Used for audio diarization and for labeling YouTube-caption turns (no audio upload).",
  speakerCount:
    "Optional hint for how many distinct people are talking (2–8). Only used with videoUrl ASR captions. Omit to let the model infer.",
  diarized: "Diarized transcript object, as returned by POST /viral-clipper/diarize.",
  videoSource:
    "Local filesystem path to the SOURCE VIDEO (not audio-only) to cut clips from, or a publicly-reachable video URL — cutting needs the real video stream.",
  clips: "List of time ranges to cut, e.g. straight from /viral-moments' candidates.",
  diarizedForSnap:
    "Optional diarized transcript — when provided, each clip's start/end is snapped to the nearest real speech-segment boundary so cuts don't land mid-word. Omit to cut at the raw timestamps plus fixed padding only.",
  minClipSeconds: "Minimum candidate clip length in seconds.",
  maxClipSeconds:
    "Maximum candidate clip length in seconds — defaults to 60 (Shorts/Reels length). Raise this if you specifically want longer YouTube-Shorts-style clips, up to VIRAL_CLIPPER.MAX_CLIP_SECONDS.",
  channelContext:
    "Optional free-text description of the channel/show and its audience (e.g. niche, tone, typical audience) — used to weight which moments and hook_types fit this audience. Omit to use the generic (still high-quality) default.",
  audienceSignals:
    "Optional pre-fetched, pre-formatted lines of real audience behavior on this exact episode — e.g. from the youtube module's comments-intel timestamp clusters and/or video chapters, formatted via its audience-signal formatters — used to bias candidate selection toward moments viewers/the creator already flagged. Fetch those yourself first; this field just takes the output.",
  aspectRatio:
    "Output aspect ratio for cut clips: '9:16' (Shorts/Reels/TikTok, default), '16:9' (YouTube/landscape), '1:1' (square), or 'original' (no crop, keep source framing). Cropping is centered on the source frame.",
} as const;

export const VIRAL_CLIPPER_GEMINI_MODEL = {
  /** Stable GA flash-tier model — used for both diarization (audio) and viral-moment scoring (text). */
  DEFAULT: "gemini-3.5-flash",
} as const;

/** Supported output framings for `/viral-clipper/cut`. */
export const VIRAL_CLIPPER_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "original"] as const;

/**
 * Target pixel dimensions + integer width:height ratio per aspect ratio.
 * Ratios are kept as separate integers (not a precomputed float) so the
 * ffmpeg crop expression built in `ffmpeg-cut.ts` can compare
 * `iw*ratioH` vs `ih*ratioW` — cross-multiplication avoids any float
 * rounding / division-chain-order bugs in ffmpeg's own expression evaluator.
 */
export const VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS = {
  "9:16": { ratioW: 9, ratioH: 16, outputWidth: 1080, outputHeight: 1920 },
  "16:9": { ratioW: 16, ratioH: 9, outputWidth: 1920, outputHeight: 1080 },
  "1:1": { ratioW: 1, ratioH: 1, outputWidth: 1080, outputHeight: 1080 },
} as const;

export const VIRAL_CLIPPER = {
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
   * a guarantee — see viral-clipper/README.md.
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
  /** Caption-turn labeling: YouTube ASR never names speakers, so we cap how many ids Gemini may invent. */
  MAX_CAPTION_SPEAKERS: 8,
} as const;

export const VIRAL_CLIPPER_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const VIRAL_CLIPPER_ERROR_MESSAGES = {
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
  YOUTUBE_METADATA_FETCH_FAILED: "Failed to fetch YouTube video metadata",
  CAPTIONS_EMPTY: "YouTube captions were empty",
  GENERIC: "Viral Clipper pipeline step failed",
  VERCEL:
    "Viral Clipper's cut step needs a persistent host with local disk output (not available on Vercel)",
} as const;

export const VIRAL_CLIPPER_OUTPUT_DIR = resolve(
  process.env.VIRAL_CLIPPER_OUTPUT_DIR || AIXEL_MEDIA.VIRAL_CLIPPER_CUTS,
);
