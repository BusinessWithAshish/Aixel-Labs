import { z } from "zod";

import {
  MEDIA_CONDENSE,
  MEDIA_CONDENSE_FIELD_DESCRIPTIONS,
} from "./constants";

export const MEDIA_CONDENSE_REQUEST_SCHEMA = z.object({
  videoSource: z
    .string()
    .min(1)
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.videoSource),
  silenceThresholdDb: z
    .number()
    .min(MEDIA_CONDENSE.MIN_SILENCE_THRESHOLD_DB)
    .max(MEDIA_CONDENSE.MAX_SILENCE_THRESHOLD_DB)
    .optional()
    .default(MEDIA_CONDENSE.DEFAULT_SILENCE_THRESHOLD_DB)
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.silenceThresholdDb),
  minSilenceSeconds: z
    .number()
    .min(MEDIA_CONDENSE.MIN_MIN_SILENCE_SECONDS)
    .max(MEDIA_CONDENSE.MAX_MIN_SILENCE_SECONDS)
    .optional()
    .default(MEDIA_CONDENSE.DEFAULT_MIN_SILENCE_SECONDS)
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.minSilenceSeconds),
  keepPaddingSeconds: z
    .number()
    .min(0)
    .max(MEDIA_CONDENSE.MAX_KEEP_PADDING_SECONDS)
    .optional()
    .default(MEDIA_CONDENSE.DEFAULT_KEEP_PADDING_SECONDS)
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.keepPaddingSeconds),
  removeFillers: z
    .boolean()
    .optional()
    .default(true)
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.removeFillers),
  fillerWords: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.fillerWords),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .describe(MEDIA_CONDENSE_FIELD_DESCRIPTIONS.language),
});
