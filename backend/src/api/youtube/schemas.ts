import { z } from "zod";
import {
  YOUTUBE_DEFAULT_COUNTRY,
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_HANDLE_MAX_LENGTH,
  YOUTUBE_MAX_LIMIT,
} from "./constants";

/** Two-letter ISO 3166-1 alpha-2 country code — used for proxy routing and InnerTube `gl`. */
export const YOUTUBE_COUNTRY_SCHEMA = z
  .string()
  .trim()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "Country must be a 2-letter ISO code")
  .transform((value) => value.toUpperCase())
  .default(YOUTUBE_DEFAULT_COUNTRY)
  .describe(
    "Two-letter ISO 3166-1 alpha-2 country code (e.g. US, GB). Routes requests through a country-targeted proxy.",
  );

/**
 * Optional city/state/region hint. Not used for Evomi proxy (country-only).
 * For search, folded into the YouTube search query text.
 */
export const YOUTUBE_REGION_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .optional()
  .describe(
    "Optional city/state/region hint. Appended to search query text; not used for proxy routing (Evomi is country-scoped only).",
  );

/** Shared geo fields included on every YouTube API request body. */
export const YOUTUBE_GEO_REQUEST_SCHEMA = z.object({
  country: YOUTUBE_COUNTRY_SCHEMA,
  region: YOUTUBE_REGION_SCHEMA,
});

export const YOUTUBE_HANDLE_VALUE_SCHEMA = z
  .string()
  .min(1)
  .max(YOUTUBE_HANDLE_MAX_LENGTH)
  .transform((value) => value.trim().replace(/^@/, ""))
  .refine((value) => /^[a-zA-Z0-9._-]+$/.test(value), "Invalid YouTube handle");

export const YOUTUBE_VIDEO_ID_SCHEMA = z
  .string()
  .min(1)
  .max(20)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid YouTube video ID")
  .describe("YouTube video ID (e.g. dQw4w9WgXcQ)");

export const YOUTUBE_CHANNEL_ID_SCHEMA = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9_-]+$/, "Invalid YouTube channel ID")
  .describe("YouTube channel ID (e.g. UCxxxxxxxxxxxxxxxxxxxxxx)");

/** Shared optional result-limit field for paginated YouTube scrapers. */
export function youtubeLimitSchema(description: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(YOUTUBE_MAX_LIMIT)
    .default(YOUTUBE_DEFAULT_LIMIT)
    .optional()
    .describe(
      `${description} (default ${YOUTUBE_DEFAULT_LIMIT}, max ${YOUTUBE_MAX_LIMIT})`,
    );
}
