import type { z } from "zod";

import type { MEDIA_TRANSCRIBE_FORMAT, MEDIA_TRANSCRIBE_MODEL } from "./constants";
import type { MEDIA_TRANSCRIBE_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_TRANSCRIBE_REQUEST = z.input<typeof MEDIA_TRANSCRIBE_REQUEST_SCHEMA>;

export type MEDIA_TRANSCRIBE_REQUEST_PARSED = z.output<
  typeof MEDIA_TRANSCRIBE_REQUEST_SCHEMA
>;

export type MEDIA_TRANSCRIBE_FORMAT_VALUE =
  (typeof MEDIA_TRANSCRIBE_FORMAT)[keyof typeof MEDIA_TRANSCRIBE_FORMAT];

export type MEDIA_TRANSCRIBE_MODEL_VALUE =
  (typeof MEDIA_TRANSCRIBE_MODEL)[keyof typeof MEDIA_TRANSCRIBE_MODEL];

/** One Groq `verbose_json` segment — start/end in seconds. */
export type GROQ_TRANSCRIPTION_SEGMENT = {
  id: number;
  start: number;
  end: number;
  text: string;
};

/**
 * One Groq `verbose_json` word — only present when the request asked for
 * `timestamp_granularities[]=word`. Timings are approximate (Whisper aligns
 * words against 20ms audio frames, so expect ~±100ms), which is why anything
 * cutting on these should clamp against neighbouring words rather than trust
 * a single boundary — see `condense/fillers.ts`.
 */
export type GROQ_TRANSCRIPTION_WORD = {
  word: string;
  start: number;
  end: number;
};

export type GROQ_VERBOSE_JSON_RESPONSE = {
  task?: string;
  language?: string;
  duration?: number;
  text: string;
  segments: GROQ_TRANSCRIPTION_SEGMENT[];
  words?: GROQ_TRANSCRIPTION_WORD[];
};

export type MEDIA_TRANSCRIBE_RESPONSE = {
  format: MEDIA_TRANSCRIBE_FORMAT_VALUE;
  content: string;
  language?: string;
  durationSeconds?: number;
};
