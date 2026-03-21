import { z } from "zod";

import { GSEARCH_TIME_FILTER } from "./types";
import {
  DEFAULT_GSEARCH_MAX_PAGES,
  DEFAULT_GSEARCH_LANGUAGE,
  GOOGLE_SEARCH_QUERY_LIMITS,
} from "./constants";

export const GSEARCH_REQUEST_SCHEMA = z.object({
  searchQuery: z.string().max(GOOGLE_SEARCH_QUERY_LIMITS.maxQueryChars),
  pages: z.number().min(1).max(DEFAULT_GSEARCH_MAX_PAGES),
  country: z.string(),
  city: z.string(),
  timeFilter: z.nativeEnum(GSEARCH_TIME_FILTER).optional(),
  language: z.string().default(DEFAULT_GSEARCH_LANGUAGE).optional(),
});
