/**
 * Transcription — single source of truth for limits, allow-lists, and Groq wiring.
 * Nothing in ffmpeg/groq-client/formatters/client should hardcode these values.
 */

export const TRANSCRIPTION_FIELD_DESCRIPTIONS = {
  mediaSource:
    "Local filesystem path to the video/audio file to transcribe (read directly off disk), or a publicly-reachable URL.",
  format: "Output caption format.",
  language:
    "Optional ISO-639-1 language code to improve accuracy (e.g. 'en').",
  model: "Optional Groq Whisper model override.",
} as const;

export const TRANSCRIPTION_FORMAT = {
  TXT: "txt",
  JSON: "json",
  SRT: "srt",
  VTT: "vtt",
} as const;

export const TRANSCRIPTION_MODEL = {
  TURBO: "whisper-large-v3-turbo",
  LARGE: "whisper-large-v3",
} as const;

export const TRANSCRIPTION = {
  DEFAULT_FORMAT: TRANSCRIPTION_FORMAT.TXT,
  DEFAULT_MODEL: TRANSCRIPTION_MODEL.TURBO,
  /** Cap on the ffmpeg-normalized (16kHz mono FLAC) file we actually send to Groq — matches Groq's dev-tier limit. */
  GROQ_MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024,
  /** ffmpeg normalize target — Groq downsamples to this internally anyway, so pre-downsampling loses nothing. */
  TARGET_SAMPLE_RATE_HZ: 16000,
  TARGET_CHANNELS: 1,
} as const;

export const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

/**
 * Status codes from a plain `fetch()` download worth retrying through the
 * TLS-fingerprint session (`utils/node-tls-client-session-handler.ts`) instead
 * of failing outright — bot-detection / rate-limit responses, not "genuinely
 * missing" (404/410, which no amount of fingerprint-spoofing fixes).
 */
export const TRANSCRIPTION_GATED_STATUS_CODES = [401, 403, 429, 503] as const;

export const TRANSCRIPTION_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  MISSING_API_KEY: "GROQ_API_KEY is not configured",
  DOWNLOAD_FAILED: "Failed to download source file",
  FFMPEG_FAILED: "Failed to extract/normalize audio",
  TOO_LARGE_AFTER_NORMALIZE:
    "Normalized audio exceeds the Groq upload size limit — trim the source file and try again",
  GROQ_FAILED: "Groq transcription request failed",
  GENERIC: "Transcription failed",
} as const;
