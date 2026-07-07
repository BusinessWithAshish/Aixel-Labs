import { z } from "zod";

import {
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_SAFE,
  GSEARCH_TIME_FILTER,
} from "./constants";

/** Two-letter ISO 3166-1 alpha-2 country — drives Evomi `_country-XX` proxy + `gl`. */
export const GSEARCH_COUNTRY_SCHEMA = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "Country must be a 2-letter ISO 3166-1 alpha-2 code")
  .transform((v) => v.toUpperCase())
  .describe(
    "Required. Two-letter ISO 3166-1 alpha-2 country code (e.g. US, GB, IN). " +
      "Routes the request through a country-targeted Evomi proxy and sets Google `gl`.",
  );

/**
 * Optional region / city (e.g. "Austin, Texas" or "Mumbai"). Appended to the
 * query text ("<query> in <region>") — the reliable location signal for CSE.
 */
export const GSEARCH_REGION_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe(
    "Optional region/city for location-targeted results (e.g. 'Austin, Texas'). " +
      "Appended to the query text and used for best-effort proxy region routing.",
  );

export const GSEARCH_REQUEST_SCHEMA = z.object({
  searchQuery: z
    .string()
    .trim()
    .min(1)
    .max(GSEARCH_MAX_QUERY_CHARS)
    .describe("The web search query."),
  country: GSEARCH_COUNTRY_SCHEMA,
  region: GSEARCH_REGION_SCHEMA,
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
