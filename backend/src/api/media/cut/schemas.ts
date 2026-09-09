import { z } from "zod";

import {
  MEDIA,
  MEDIA_ASPECT_RATIOS,
  MEDIA_FIELD_DESCRIPTIONS,
} from "../constants";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "../diarize/schemas";

const CLIP_RANGE_SCHEMA = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});

export const MEDIA_CUT_REQUEST_SCHEMA = z.object({
  videoSource: z
    .string()
    .min(1)
    .describe(MEDIA_FIELD_DESCRIPTIONS.videoSource),
  clips: z.array(CLIP_RANGE_SCHEMA).min(1).describe(MEDIA_FIELD_DESCRIPTIONS.clips),
  diarized: DIARIZED_TRANSCRIPT_SCHEMA.optional().describe(
    MEDIA_FIELD_DESCRIPTIONS.diarizedForSnap,
  ),
  aspectRatio: z
    .enum(MEDIA_ASPECT_RATIOS)
    .optional()
    .default(MEDIA.DEFAULT_ASPECT_RATIO)
    .describe(MEDIA_FIELD_DESCRIPTIONS.aspectRatio),
});
