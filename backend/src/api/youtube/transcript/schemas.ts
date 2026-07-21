import { z } from "zod";
import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_ID_SCHEMA,
} from "../schemas";
import { YOUTUBE_TRANSCRIPT_DEFAULT_HL } from "./constants";

/** BCP-47 language code (e.g. "en", "en-US", "es"). Defaults to "en". */
export const YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/, "Invalid language code")
  .default(YOUTUBE_TRANSCRIPT_DEFAULT_HL)
  .describe(
    'BCP-47 language code for the desired caption track (e.g. "en", "es", "en-US"). Defaults to "en".',
  );

export const YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA =
  YOUTUBE_GEO_REQUEST_SCHEMA.extend({
    videoId: YOUTUBE_VIDEO_ID_SCHEMA,
    language: YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA,
  });
