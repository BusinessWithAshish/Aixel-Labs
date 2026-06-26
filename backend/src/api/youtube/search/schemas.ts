import { z } from "zod";
import { YT_SEARCH_FILTER } from "../constants";
import {
  YOUTUBE_DEFAULT_SEARCH_LIMIT,
  YOUTUBE_MAX_SEARCH_LIMIT,
} from "../constants";

export const YOUTUBE_SEARCH_REQUEST_SCHEMA = z.object({
  query: z
    .string()
    .min(1)
    .max(500)
    .describe("Search keyword or phrase"),
  filter: z
    .nativeEnum(YT_SEARCH_FILTER)
    .optional()
    .describe("Content type filter (video, channel, playlist, movie, short)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(YOUTUBE_MAX_SEARCH_LIMIT)
    .default(YOUTUBE_DEFAULT_SEARCH_LIMIT)
    .optional()
    .describe("Maximum number of results to return"),
  withPlaylist: z
    .boolean()
    .default(false)
    .optional()
    .describe("Include playlist results alongside videos"),
});
