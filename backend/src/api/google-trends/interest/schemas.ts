import { z } from "zod";
import {
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_CATEGORY_VALUES,
  GOOGLE_TRENDS_DEFAULT_GEO,
  GOOGLE_TRENDS_DEFAULT_HL,
  GOOGLE_TRENDS_DEFAULT_TZ,
  GOOGLE_TRENDS_MAX_COMPARE_QUERIES,
  GOOGLE_TRENDS_MAX_LIMIT,
  GOOGLE_TRENDS_PROPERTY,
  GOOGLE_TRENDS_PROPERTY_VALUES,
  GOOGLE_TRENDS_TIMEFRAME,
  GOOGLE_TRENDS_TIMEFRAME_VALUES,
} from "../constants";

/** ISO 3166-1 alpha-2 country code — used as the `geo` query param. Defaults to "US". */
export const GOOGLE_TRENDS_INTEREST_GEO_SCHEMA = z
  .string()
  .trim()
  .min(2)
  .max(8)
  .regex(/^[A-Za-z]{2}(-[A-Za-z0-9]{1,3})?$/, "geo must be a 2-letter ISO country code or ISO 3166-2 region code")
  .transform((value) => value.toUpperCase())
  .default(GOOGLE_TRENDS_DEFAULT_GEO)
  .describe(
    'Geographic scope. Either a 2-letter ISO 3166-1 alpha-2 country code (e.g. "US", "IN", "GB") or an ISO 3166-2 region code (e.g. "US-CA"). Empty string "" means worldwide. Defaults to "US".',
  );

/** BCP-47 language code (e.g. "en", "es", "hi", "ja"). Defaults to "en". */
export const GOOGLE_TRENDS_INTEREST_HL_SCHEMA = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]+)*$/, "Invalid language code")
  .default(GOOGLE_TRENDS_DEFAULT_HL)
  .describe(
    'BCP-47 language code for the response (e.g. "en", "es", "hi", "ja"). Defaults to "en".',
  );

/** Timeframe preset. */
export const GOOGLE_TRENDS_TIMEFRAME_SCHEMA = z
  .enum([
    GOOGLE_TRENDS_TIMEFRAME.LAST_7_DAYS,
    GOOGLE_TRENDS_TIMEFRAME.LAST_30_DAYS,
    GOOGLE_TRENDS_TIMEFRAME.LAST_90_DAYS,
    GOOGLE_TRENDS_TIMEFRAME.LAST_12_MONTHS,
    GOOGLE_TRENDS_TIMEFRAME.LAST_5_YEARS,
  ])
  .default(GOOGLE_TRENDS_TIMEFRAME.LAST_12_MONTHS)
  .describe(
    "Timeframe preset. One of: \"now 7-d\" (last 7 days), \"today 1-m\" (last 30 days), \"today 3-m\" (last 90 days), \"today 12-m\" (last 12 months), \"today 5-y\" (last 5 years). Defaults to \"today 12-m\".",
  );

/** Google property (search vertical). */
export const GOOGLE_TRENDS_PROPERTY_SCHEMA = z
  .enum([
    GOOGLE_TRENDS_PROPERTY.WEB,
    GOOGLE_TRENDS_PROPERTY.YOUTUBE,
    GOOGLE_TRENDS_PROPERTY.NEWS,
    GOOGLE_TRENDS_PROPERTY.IMAGES,
    GOOGLE_TRENDS_PROPERTY.SHOPPING,
  ])
  .default(GOOGLE_TRENDS_PROPERTY.WEB)
  .describe(
    'Google search vertical. "" (empty) = Google web search, "youtube" = YouTube search, "news" = Google News, "images" = Google Images, "froogle" = Google Shopping. Defaults to "" (web search).',
  );

/** Category ID. `0` means "All categories". */
export const GOOGLE_TRENDS_INTEREST_CATEGORY_SCHEMA = z
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

/** Single keyword string. */
export const GOOGLE_TRENDS_KEYWORD_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("Search term / keyword to compare (1–200 chars).");

/** Maximum number of related queries / geo entries to return per category. */
export const GOOGLE_TRENDS_INTEREST_LIMIT_SCHEMA = z
  .number()
  .int()
  .min(1)
  .max(GOOGLE_TRENDS_MAX_LIMIT)
  .default(100)
  .describe(
    `Maximum number of related queries and geo entries to return per category (default 100, max ${GOOGLE_TRENDS_MAX_LIMIT}).`,
  );

/**
 * Single-query interest request. Use this when you want to analyse one
 * keyword. The multi-query comparison shape is built by the comparison
 * schemas in `./compare-schemas.ts`.
 */
export const GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA = z.object({
  keyword: GOOGLE_TRENDS_KEYWORD_SCHEMA,
  geo: GOOGLE_TRENDS_INTEREST_GEO_SCHEMA,
  hl: GOOGLE_TRENDS_INTEREST_HL_SCHEMA,
  timeframe: GOOGLE_TRENDS_TIMEFRAME_SCHEMA,
  category: GOOGLE_TRENDS_INTEREST_CATEGORY_SCHEMA,
  property: GOOGLE_TRENDS_PROPERTY_SCHEMA,
  limit: GOOGLE_TRENDS_INTEREST_LIMIT_SCHEMA,
  tz: z
    .number()
    .int()
    .min(-720)
    .max(840)
    .default(GOOGLE_TRENDS_DEFAULT_TZ)
    .describe("Timezone offset in minutes (e.g. -300 for America/New_York). Defaults to -300."),
});

/**
 * Multi-query comparison request. 2–5 keywords compared on the same
 * normalised 0–100 scale. Geo, timeframe, category, and property are shared
 * across all keywords.
 */
export const GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA = z
  .object({
    keywords: z
      .array(GOOGLE_TRENDS_KEYWORD_SCHEMA)
      .min(2)
      .max(GOOGLE_TRENDS_MAX_COMPARE_QUERIES)
      .describe(
        `Array of 2–5 keywords to compare. Google Trends normalises them onto a shared 0–100 scale so direct comparison is meaningful.`,
      ),
    geo: GOOGLE_TRENDS_INTEREST_GEO_SCHEMA,
    hl: GOOGLE_TRENDS_INTEREST_HL_SCHEMA,
    timeframe: GOOGLE_TRENDS_TIMEFRAME_SCHEMA,
    category: GOOGLE_TRENDS_INTEREST_CATEGORY_SCHEMA,
    property: GOOGLE_TRENDS_PROPERTY_SCHEMA,
    limit: GOOGLE_TRENDS_INTEREST_LIMIT_SCHEMA,
    tz: z
      .number()
      .int()
      .min(-720)
      .max(840)
      .default(GOOGLE_TRENDS_DEFAULT_TZ)
      .describe("Timezone offset in minutes. Defaults to -300."),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const kw of data.keywords) {
      const key = kw.toLowerCase();
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate keyword "${kw}" — comparison keywords must be unique.`,
          path: ["keywords"],
        });
      }
      seen.add(key);
    }
  });

export type GOOGLE_TRENDS_COMPARE_REQUEST = z.infer<
  typeof GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA
>;
