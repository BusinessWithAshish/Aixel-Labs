import { z } from "zod";

import { toAlpha2CountryCode } from "./country";

/**
 * Required ISO 3166-1 alpha-2 country code (e.g. US, IN, GB).
 * Accepts mixed case; rejects unknown codes and full country names.
 */
export const ISO_COUNTRY_CODE_SCHEMA = z
  .string()
  .trim()
  .length(2, "Country must be a 2-letter ISO 3166-1 alpha-2 code")
  .regex(/^[A-Za-z]{2}$/, "Country must be a 2-letter ISO 3166-1 alpha-2 code")
  .transform((v) => v.toUpperCase())
  .refine((v) => toAlpha2CountryCode(v) !== null, {
    message: "Invalid ISO 3166-1 alpha-2 country code",
  })
  .describe(
    "Required. Two-letter ISO 3166-1 alpha-2 country code (e.g. US, IN, GB).",
  );

/** Optional free-text state / province (e.g. 'California', 'Maharashtra'). */
export const LOCATION_STATE_SCHEMA = z
  .string()
  .trim()
  .optional()
  .describe(
    "Optional state or province within the country (e.g. 'California', 'Maharashtra').",
  );

/** Optional free-text city (e.g. 'Mumbai', 'San Francisco'). */
export const LOCATION_CITY_SCHEMA = z
  .string()
  .trim()
  .optional()
  .describe(
    "Optional city name to restrict the search geographically (e.g. 'Mumbai', 'San Francisco').",
  );

/**
 * Shared location block used by Instagram, LinkedIn people/company, and similar
 * lead-gen APIs. Country is always a validated ISO alpha-2 code.
 */
export const LOCATION_FIELDS_SCHEMA = z.object({
  country: ISO_COUNTRY_CODE_SCHEMA,
  state: LOCATION_STATE_SCHEMA,
  city: LOCATION_CITY_SCHEMA,
});

export type LOCATION_FIELDS = z.infer<typeof LOCATION_FIELDS_SCHEMA>;
