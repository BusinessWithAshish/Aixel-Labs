import { z } from "zod";
import { YT_SEARCH_FILTER } from "../constants";
import {
  YOUTUBE_SEARCH_DEFAULT_LIMIT,
  YOUTUBE_SEARCH_MAX_LIMIT,
} from "./constants";

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
    .max(YOUTUBE_SEARCH_MAX_LIMIT)
    .default(YOUTUBE_SEARCH_DEFAULT_LIMIT)
    .optional()
    .describe(
      "Maximum number of results to return (default 1000, max 1000)",
    ),
  withPlaylist: z
    .boolean()
    .default(false)
    .optional()
    .describe("Include playlist results alongside videos"),
});
