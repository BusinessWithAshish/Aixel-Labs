import { z } from "zod";
import { YOUTUBE_MAX_SEARCH_LIMIT } from "../constants";

export const YOUTUBE_PLAYLIST_PARAMS_SCHEMA = z.object({
  playlistId: z
    .string()
    .min(1)
    .max(50)
    .describe("YouTube playlist ID (e.g. PLxxxxxx)"),
});

export const YOUTUBE_PLAYLIST_QUERY_SCHEMA = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : undefined))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(YOUTUBE_MAX_SEARCH_LIMIT)
        .optional(),
    )
    .describe("Maximum number of videos to return"),
});
