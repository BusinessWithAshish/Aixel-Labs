/** `media` op=assemble — narrated sentences and their phrase footage in, one recap out. */
export const MEDIA_ASSEMBLE = {
  FPS: 30,
  AUDIO_RATE: 48000,
  AUDIO_BITRATE: "160k",
  /** A slot shorter than a frame cannot be shown; its time goes to a neighbour. */
  MIN_SLOT_SECONDS: 0.04,
  TIMEOUT_MS: 20 * 60 * 1000,
  DEFAULT_SENTENCE_PAUSE_SECONDS: 0.22,
  MAX_SENTENCE_PAUSE_SECONDS: 3,
} as const;

export const MEDIA_ASSEMBLE_ERRORS = {
  FFMPEG_FAILED: "ffmpeg failed to assemble the recap",
  OUTSIDE_ROOT: "Assemble only takes files under the media root",
  NOT_FOUND: "File not found",
  NO_AUDIO: "Could not read the narration audio's length",
} as const;
