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

export type GROQ_VERBOSE_JSON_RESPONSE = {
  task?: string;
  language?: string;
  duration?: number;
  text: string;
  segments: GROQ_TRANSCRIPTION_SEGMENT[];
};

export type TRANSCRIPTION_RESPONSE = {
  format: TRANSCRIPTION_FORMAT_VALUE;
  content: string;
  language?: string;
  durationSeconds?: number;
};
