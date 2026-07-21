import { z } from "zod";
import { YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA } from "../../transcript/schemas";

/** Optional video title — used to compute the title alignment score. */
export const YOUTUBE_TRANSCRIPT_TITLE_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .optional()
  .describe(
    "Optional video title. When provided, the intelligence layer computes a title alignment score (0–1) measuring how well the title's significant words appear in the transcript, particularly the intro zone. When omitted, titleAlignmentScore is null.",
  );

export const YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA =
  YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA.extend({
    title: YOUTUBE_TRANSCRIPT_TITLE_SCHEMA,
  });

export type YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST = z.infer<
  typeof YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA
>;
