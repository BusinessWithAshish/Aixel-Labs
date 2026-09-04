import { z } from "zod";

import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ASPECT_RATIOS,
  VIRAL_CLIPPER_FIELD_DESCRIPTIONS,
} from "../constants";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "../diarize/schemas";

const CLIP_RANGE_SCHEMA = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});

export const VIRAL_CLIPPER_CUT_REQUEST_SCHEMA = z.object({
  videoSource: z
    .string()
    .min(1)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.videoSource),
  clips: z.array(CLIP_RANGE_SCHEMA).min(1).describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.clips),
  diarized: DIARIZED_TRANSCRIPT_SCHEMA.optional().describe(
    VIRAL_CLIPPER_FIELD_DESCRIPTIONS.diarizedForSnap,
  ),
  aspectRatio: z
    .enum(VIRAL_CLIPPER_ASPECT_RATIOS)
    .optional()
    .default(VIRAL_CLIPPER.DEFAULT_ASPECT_RATIO)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.aspectRatio),
});
