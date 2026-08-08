import { z } from "zod";

import {
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_SAFE,
  GSEARCH_TIME_FILTER,
} from "../constants";
import { GSEARCH_REGION_SCHEMA } from "../schemas";
import {
  ISO_COUNTRY_CODE_SCHEMA,
  LOCATION_STATE_SCHEMA,
} from "../../../utils/location-schema";

/**
 * Same fields as v1, but `timeFilter` has **no default**.
 * - omitted → Docs Explore (KG + organic)
 * - set → CSE fallback (Docs Explore does not support time filters)
 */
export const GSEARCH_V2_REQUEST_SCHEMA = z.object({
  searchQuery: z
    .string()
    .trim()
    .min(1)
    .max(GSEARCH_MAX_QUERY_CHARS)
    .describe("The web search query."),
  country: ISO_COUNTRY_CODE_SCHEMA.describe(
    "Required. Two-letter ISO 3166-1 alpha-2 country code (e.g. US, GB, IN). " +
      "Routes the request through a country-targeted Evomi proxy.",
  ),
  region: GSEARCH_REGION_SCHEMA,
  state: LOCATION_STATE_SCHEMA,
  pages: z
    .number()
    .int()
    .min(1)
    .max(GSEARCH_MAX_PAGES)
    .optional()
    .default(GSEARCH_DEFAULT_PAGES)
    .describe(
      `Number of result pages (~20 each). Default ${GSEARCH_DEFAULT_PAGES}, ` +
        `max ${GSEARCH_MAX_PAGES}.`,
    ),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .optional()
    .default(GSEARCH_DEFAULT_LANGUAGE)
    .describe("Interface/results language (`hl`/`lr`). Default 'en'."),
  safe: z
    .nativeEnum(GSEARCH_SAFE)
    .optional()
    .default(GSEARCH_SAFE.OFF)
    .describe(
      "Safe-search level (honored on CSE fallback only; Docs Explore cannot disable SafeSearch).",
    ),
  timeFilter: z
    .nativeEnum(GSEARCH_TIME_FILTER)
    .optional()
    .describe(
      "Optional. When set, routes to CSE (Docs Explore ignores date filters). " +
        "Omit for Docs Explore (default v2 path).",
    ),
});
