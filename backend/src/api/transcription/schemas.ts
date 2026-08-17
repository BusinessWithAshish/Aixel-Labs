import { z } from "zod";

import {
  TRANSCRIPTION,
  TRANSCRIPTION_FIELD_DESCRIPTIONS,
  TRANSCRIPTION_FORMAT,
  TRANSCRIPTION_MODEL,
} from "./constants";

export const TRANSCRIPTION_REQUEST_SCHEMA = z.object({
  mediaSource: z
    .string()
    .min(1)
    .describe(TRANSCRIPTION_FIELD_DESCRIPTIONS.mediaSource),
  format: z
    .enum([
      TRANSCRIPTION_FORMAT.TXT,
      TRANSCRIPTION_FORMAT.JSON,
      TRANSCRIPTION_FORMAT.SRT,
      TRANSCRIPTION_FORMAT.VTT,
    ])
    .optional()
    .default(TRANSCRIPTION.DEFAULT_FORMAT)
    .describe(TRANSCRIPTION_FIELD_DESCRIPTIONS.format),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .describe(TRANSCRIPTION_FIELD_DESCRIPTIONS.language),
  model: z
    .enum([TRANSCRIPTION_MODEL.TURBO, TRANSCRIPTION_MODEL.LARGE])
    .optional()
    .default(TRANSCRIPTION.DEFAULT_MODEL)
    .describe(TRANSCRIPTION_FIELD_DESCRIPTIONS.model),
});
