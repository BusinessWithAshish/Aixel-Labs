import { z } from "zod";

import {
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_SAFE,
  GSEARCH_TIME_FILTER,
} from "./constants";
import {
  ISO_COUNTRY_CODE_SCHEMA,
  LOCATION_CITY_SCHEMA,
  LOCATION_STATE_SCHEMA,
} from "../../utils/location-schema";

/**
 * Optional city / locality for the CSE `"… in …"` location clause.
 * Prefer passing `city` here and `state` separately — both are combined in
 * `buildLocationQuery`.
 */
export const GSEARCH_REGION_SCHEMA = LOCATION_CITY_SCHEMA.describe(
  "Optional city/locality for location-targeted results (e.g. 'Austin', 'Mumbai'). " +
    "Combined with `state` into the query text (`q in city, state`).",
);

export const GSEARCH_REQUEST_SCHEMA = z.object({
  searchQuery: z
    .string()
    .trim()
    .min(1)
    .max(GSEARCH_MAX_QUERY_CHARS)
    .describe("The web search query."),
  country: ISO_COUNTRY_CODE_SCHEMA.describe(
    "Required. Two-letter ISO 3166-1 alpha-2 country code (e.g. US, GB, IN). " +
      "Routes the request through a country-targeted Evomi proxy and sets Google `gl`.",
  ),
  /** City / locality — used as the primary `"in …"` location fragment. */
  region: GSEARCH_REGION_SCHEMA,
  /** Optional state / province — appended after city when both are set. */
  state: LOCATION_STATE_SCHEMA,
  pages: z
    .number()
    .int()
    .min(1)
    .max(GSEARCH_MAX_PAGES)
    .default(GSEARCH_DEFAULT_PAGES)
    .optional()
    .describe(
      `Number of result pages (20 results each). Default ${GSEARCH_DEFAULT_PAGES}, ` +
        `max ${GSEARCH_MAX_PAGES} (~120 results — Google's hard CSE ceiling).`,
    ),
  language: z
    .string()
    .trim()
    .min(2)
    .max(5)
    .default(GSEARCH_DEFAULT_LANGUAGE)
    .optional()
    .describe("Interface/results language (`hl`). Default 'en'."),
  safe: z
    .nativeEnum(GSEARCH_SAFE)
    .default(GSEARCH_SAFE.OFF)
    .optional()
    .describe("Safe-search level: off | medium | high. Default off."),
  timeFilter: z
    .nativeEnum(GSEARCH_TIME_FILTER)
    .optional()
    .describe("Restrict to results from the last day/week/month/year."),
});
