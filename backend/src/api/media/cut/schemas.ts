import { z } from "zod";

import {
  MEDIA,
  MEDIA_ASPECT_RATIOS,
  MEDIA_BOUNDARY_MODES,
  MEDIA_FIELD_DESCRIPTIONS,
  MEDIA_NATURAL_BOUNDARIES,
  MEDIA_REFRAME,
  MEDIA_REFRAME_MODES,
} from "../constants";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "../diarize/schemas";

const CLIP_RANGE_SCHEMA = z.object({
  // Seconds as a number or a timestamp string. Ledgers and segment output
  // store numbers; rejecting them made every revise re-cut fail once first.
  start: z.union([z.string(), z.number()]).transform(String),
  end: z.union([z.string(), z.number()]).transform(String),
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
  reframe: z
    .enum(MEDIA_REFRAME_MODES)
    .optional()
    .default(MEDIA_REFRAME.DEFAULT_MODE)
    .describe(MEDIA_FIELD_DESCRIPTIONS.reframe),
  boundaries: z
    .enum(MEDIA_BOUNDARY_MODES)
    .optional()
    .default(MEDIA_NATURAL_BOUNDARIES.DEFAULT_MODE)
    .describe(MEDIA_FIELD_DESCRIPTIONS.boundaries),
  language: z.string().trim().min(2).max(5).optional().describe(MEDIA_FIELD_DESCRIPTIONS.cutLanguage),
});
