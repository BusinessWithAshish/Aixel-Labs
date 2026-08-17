import { z } from "zod";

import {
  TIGHTENING,
  TIGHTENING_FIELD_DESCRIPTIONS,
} from "./constants";

export const TIGHTENING_REQUEST_SCHEMA = z.object({
  videoSource: z
    .string()
    .min(1)
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.videoSource),
  silenceThresholdDb: z
    .number()
    .min(TIGHTENING.MIN_SILENCE_THRESHOLD_DB)
    .max(TIGHTENING.MAX_SILENCE_THRESHOLD_DB)
    .optional()
    .default(TIGHTENING.DEFAULT_SILENCE_THRESHOLD_DB)
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.silenceThresholdDb),
  minSilenceSeconds: z
    .number()
    .min(TIGHTENING.MIN_MIN_SILENCE_SECONDS)
    .max(TIGHTENING.MAX_MIN_SILENCE_SECONDS)
    .optional()
    .default(TIGHTENING.DEFAULT_MIN_SILENCE_SECONDS)
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.minSilenceSeconds),
  keepPaddingSeconds: z
    .number()
    .min(0)
    .max(TIGHTENING.MAX_KEEP_PADDING_SECONDS)
    .optional()
    .default(TIGHTENING.DEFAULT_KEEP_PADDING_SECONDS)
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.keepPaddingSeconds),
  removeFillers: z
    .boolean()
    .optional()
    .default(true)
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.removeFillers),
  fillerWords: z
    .array(z.string().trim().min(1))
    .min(1)
    .optional()
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.fillerWords),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .describe(TIGHTENING_FIELD_DESCRIPTIONS.language),
});
