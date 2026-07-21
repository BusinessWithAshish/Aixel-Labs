import { z } from "zod";
import {
  YOUTUBE_SUGGEST_DEFAULT_HL,
  YOUTUBE_SUGGEST_MAX_QUERY_LENGTH,
} from "../constants";
import { YOUTUBE_GEO_REQUEST_SCHEMA } from "../schemas";

/** BCP-47 language code (e.g. "en", "es", "en-US"). Defaults to "en". */
export const YOUTUBE_SUGGEST_LANGUAGE_SCHEMA = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/, "Invalid language code")
  .default(YOUTUBE_SUGGEST_DEFAULT_HL)
  .describe(
    'BCP-47 language code for suggestions (e.g. "en", "es", "en-US", "hi"). Defaults to "en".',
  );

export const YOUTUBE_SUGGEST_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  query: z
    .string()
    .trim()
    .min(1)
    .max(YOUTUBE_SUGGEST_MAX_QUERY_LENGTH)
    .describe("Partial search query to autocomplete (1–500 chars)."),
  hl: YOUTUBE_SUGGEST_LANGUAGE_SCHEMA,
  /**
   * Cursor position hint passed through as `cp`. YouTube uses this for
   * ranking but the endpoint works without it; we send it when provided.
   */
  cp: z
    .number()
    .int()
    .min(0)
    .max(YOUTUBE_SUGGEST_MAX_QUERY_LENGTH)
    .optional()
    .describe(
      "Optional cursor position in the query string (0–500). Passed through to YouTube as the `cp` param.",
    ),
});
