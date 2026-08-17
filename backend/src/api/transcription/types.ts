import type { z } from "zod";

import type { TRANSCRIPTION_FORMAT, TRANSCRIPTION_MODEL } from "./constants";
import type { TRANSCRIPTION_REQUEST_SCHEMA } from "./schemas";

export type TRANSCRIPTION_REQUEST = z.input<typeof TRANSCRIPTION_REQUEST_SCHEMA>;

export type TRANSCRIPTION_REQUEST_PARSED = z.output<
  typeof TRANSCRIPTION_REQUEST_SCHEMA
>;

export type TRANSCRIPTION_FORMAT_VALUE =
  (typeof TRANSCRIPTION_FORMAT)[keyof typeof TRANSCRIPTION_FORMAT];

export type TRANSCRIPTION_MODEL_VALUE =
  (typeof TRANSCRIPTION_MODEL)[keyof typeof TRANSCRIPTION_MODEL];

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
 * a single boundary — see `tightening/fillers.ts`.
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

export type TRANSCRIPTION_RESPONSE = {
  format: TRANSCRIPTION_FORMAT_VALUE;
  content: string;
  language?: string;
  durationSeconds?: number;
};
