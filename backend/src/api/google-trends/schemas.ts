import { z } from "zod";
import {
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_CATEGORY_VALUES,
  GOOGLE_TRENDS_DEFAULT_GEO,
  GOOGLE_TRENDS_DEFAULT_HL,
  GOOGLE_TRENDS_DEFAULT_LIMIT,
  GOOGLE_TRENDS_HOURS,
  GOOGLE_TRENDS_HOURS_VALUES,
  GOOGLE_TRENDS_MAX_LIMIT,
  GOOGLE_TRENDS_SORT,
  GOOGLE_TRENDS_SORT_VALUES,
  GOOGLE_TRENDS_STATUS,
  GOOGLE_TRENDS_STATUS_VALUES,
} from "./constants";

/** ISO 3166-1 alpha-2 country code — used as the `geo` query param. Defaults to "US". */
export const GOOGLE_TRENDS_GEO_SCHEMA = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "geo must be a 2-letter ISO country code")
  .transform((value) => value.toUpperCase())
  .default(GOOGLE_TRENDS_DEFAULT_GEO)
  .describe(
    'Two-letter ISO 3166-1 alpha-2 country code (e.g. "US", "IN", "GB", "JP"). Maps to the trending page `geo` query param.',
  );

/** BCP-47 language code (e.g. "en", "es", "hi", "ja"). Defaults to "en". */
export const GOOGLE_TRENDS_HL_SCHEMA = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/, "Invalid language code")
  .default(GOOGLE_TRENDS_DEFAULT_HL)
  .describe(
    'BCP-47 language code for the trending page (e.g. "en", "es", "hi", "ja"). Defaults to "en".',
  );

/** Time window in hours. Must be one of the values the Google Trends UI exposes. */
export const GOOGLE_TRENDS_HOURS_SCHEMA = z
  .number()
  .refine(
    (v): v is (typeof GOOGLE_TRENDS_HOURS_VALUES)[number] =>
      (GOOGLE_TRENDS_HOURS_VALUES as readonly number[]).includes(v),
    `hours must be one of: ${GOOGLE_TRENDS_HOURS_VALUES.join(", ")}`,
  )
  .default(GOOGLE_TRENDS_HOURS.PAST_24_HOURS)
  .describe(
    "Trending time window in hours. One of 4 (Past 4 hours), 24 (Past 24 hours), 48 (Past 48 hours), or 168 (Past 7 days). Defaults to 24.",
  );

/** Category ID. `0` means "All categories". */
export const GOOGLE_TRENDS_CATEGORY_SCHEMA = z
  .number()
  .int()
  .refine(
    (v) => (GOOGLE_TRENDS_CATEGORY_VALUES as readonly number[]).includes(v),
    `category must be one of: ${GOOGLE_TRENDS_CATEGORY_VALUES.join(", ")}`,
  )
  .default(GOOGLE_TRENDS_CATEGORY.ALL)
  .describe(
    `Google Trends category ID. 0 = All categories. See GOOGLE_TRENDS_CATEGORY for the full list (${GOOGLE_TRENDS_CATEGORY_VALUES.join(", ")}).`,
  );

/** Sort order — applied as post-processing on the parsed entries. */
export const GOOGLE_TRENDS_SORT_SCHEMA = z
  .enum(GOOGLE_TRENDS_SORT_VALUES)
  .default(GOOGLE_TRENDS_SORT.RELEVANCE)
  .describe(
    'Sort order for the returned trends. "relevance" (Google native order), "volume" (by search volume desc), or "started" (by start time, most recent first). Defaults to "relevance".',
  );

/** Trend status filter — applied as post-processing on the parsed entries. */
export const GOOGLE_TRENDS_STATUS_SCHEMA = z
  .enum(GOOGLE_TRENDS_STATUS_VALUES)
  .default(GOOGLE_TRENDS_STATUS.ALL)
  .describe(
    '"all" (default), "trending" (still trending — no end timestamp), or "started" (already peaked — has an end timestamp).',
  );

/** Maximum number of trending entries to return. */
export const GOOGLE_TRENDS_LIMIT_SCHEMA = z
  .number()
  .int()
  .min(1)
  .max(GOOGLE_TRENDS_MAX_LIMIT)
  .default(GOOGLE_TRENDS_DEFAULT_LIMIT)
  .describe(
    `Maximum number of trending entries to return (default ${GOOGLE_TRENDS_DEFAULT_LIMIT}, max ${GOOGLE_TRENDS_MAX_LIMIT}).`,
  );

export const GOOGLE_TRENDS_REQUEST_SCHEMA = z.object({
  geo: GOOGLE_TRENDS_GEO_SCHEMA,
  hl: GOOGLE_TRENDS_HL_SCHEMA,
  hours: GOOGLE_TRENDS_HOURS_SCHEMA,
  category: GOOGLE_TRENDS_CATEGORY_SCHEMA,
  sort: GOOGLE_TRENDS_SORT_SCHEMA,
  status: GOOGLE_TRENDS_STATUS_SCHEMA,
  limit: GOOGLE_TRENDS_LIMIT_SCHEMA,
});
