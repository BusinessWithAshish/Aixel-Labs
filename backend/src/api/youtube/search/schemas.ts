import { z } from "zod";
import {
  YT_SEARCH_FILTER,
} from "../constants";
import { YOUTUBE_GEO_REQUEST_SCHEMA, youtubeLimitSchema } from "../schemas";

export const YOUTUBE_SEARCH_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  query: z.string().min(1).max(500).describe("Search keyword or phrase"),
  filter: z
    .nativeEnum(YT_SEARCH_FILTER)
    .default(YT_SEARCH_FILTER.VIDEO)
    .describe("Content type filter (video or channel)"),
  limit: youtubeLimitSchema("Maximum number of results to return"),
});
