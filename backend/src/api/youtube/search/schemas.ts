import { z } from "zod";
import {
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_MAX_LIMIT,
  YT_SEARCH_FILTER,
} from "../constants";
import { YOUTUBE_GEO_REQUEST_SCHEMA } from "../schemas";

export const YOUTUBE_SEARCH_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  query: z.string().min(1).max(500).describe("Search keyword or phrase"),
  filter: z
    .nativeEnum(YT_SEARCH_FILTER)
    .default(YT_SEARCH_FILTER.VIDEO)
    .describe("Content type filter (video or channel)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(YOUTUBE_MAX_LIMIT)
    .default(YOUTUBE_DEFAULT_LIMIT)
    .optional()
    .describe(
      `Maximum number of results to return (default ${YOUTUBE_DEFAULT_LIMIT}, max ${YOUTUBE_MAX_LIMIT})`,
    ),
});
