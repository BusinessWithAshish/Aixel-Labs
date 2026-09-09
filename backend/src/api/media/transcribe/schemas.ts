import { z } from "zod";

import {
  MEDIA_TRANSCRIBE,
  MEDIA_TRANSCRIBE_FIELD_DESCRIPTIONS,
  MEDIA_TRANSCRIBE_FORMAT,
  MEDIA_TRANSCRIBE_MODEL,
} from "./constants";

export const MEDIA_TRANSCRIBE_REQUEST_SCHEMA = z.object({
  mediaSource: z
    .string()
    .min(1)
    .describe(MEDIA_TRANSCRIBE_FIELD_DESCRIPTIONS.mediaSource),
  format: z
    .enum([
      MEDIA_TRANSCRIBE_FORMAT.TXT,
      MEDIA_TRANSCRIBE_FORMAT.JSON,
      MEDIA_TRANSCRIBE_FORMAT.SRT,
      MEDIA_TRANSCRIBE_FORMAT.VTT,
    ])
    .optional()
    .default(MEDIA_TRANSCRIBE.DEFAULT_FORMAT)
    .describe(MEDIA_TRANSCRIBE_FIELD_DESCRIPTIONS.format),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .describe(MEDIA_TRANSCRIBE_FIELD_DESCRIPTIONS.language),
  model: z
    .enum([MEDIA_TRANSCRIBE_MODEL.TURBO, MEDIA_TRANSCRIBE_MODEL.LARGE])
    .optional()
    .default(MEDIA_TRANSCRIBE.DEFAULT_MODEL)
    .describe(MEDIA_TRANSCRIBE_FIELD_DESCRIPTIONS.model),
});
