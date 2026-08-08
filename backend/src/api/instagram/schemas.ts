import { z } from "zod";
import {
  INSTAGRAM_USERNAME_REGEX,
  INSTAGRAM_URL_REGEX,
  INSTAGRAM_QUERY_LIMITS,
  INSTAGRAM_ERROR_MESSAGES,
  INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT,
  INSTAGRAM_REQUEST_RESULT_LIMIT_MAX,
} from "./constants";
import {
  ISO_COUNTRY_CODE_SCHEMA,
  LOCATION_FIELDS_SCHEMA,
} from "../../utils/location-schema";

/** @deprecated Prefer `ISO_COUNTRY_CODE_SCHEMA` from `utils/location-schema`. */
export const INSTAGRAM_COUNTRY_SCHEMA = ISO_COUNTRY_CODE_SCHEMA;

export const INSTAGRAM_REQUEST_SCHEMA = z.object({
  entities: z
    .array(z.string())
    .max(INSTAGRAM_QUERY_LIMITS.maxEntities)
    .optional()
    .refine(
      (entities) =>
        entities?.every(
          (entity) =>
            INSTAGRAM_USERNAME_REGEX.test(entity) ||
            INSTAGRAM_URL_REGEX.test(entity),
        ),
      {
        message: INSTAGRAM_ERROR_MESSAGES.INVALID_ENTITY_FORMAT,
      },
    )
    .describe(
      "List of Instagram usernames (e.g. 'adidas') or full profile URLs (e.g. 'https://www.instagram.com/adidas'). Populate this when the user provides specific accounts to look up.",
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Free-text search query describing the type of profiles to find (e.g. 'fitness coaches in London', 'vegan food bloggers').",
    ),
  ...LOCATION_FIELDS_SCHEMA.shape,
  hashtags: z
    .array(z.string())
    .optional()
    .describe(
      "Hashtags (without the # symbol) associated with the target profiles (e.g. ['fitness', 'yoga', 'wellness']).",
    ),
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords to look for in profile bios or posts (e.g. ['personal trainer', 'certified coach']).",
    ),
  excludeKeywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords that should NOT appear in the profiles (e.g. ['spam', 'bot']).",
    ),
  excludeHashtags: z
    .array(z.string())
    .optional()
    .describe(
      "Hashtags that should NOT be associated with the profiles (e.g. ['nsfw', 'ads']).",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(INSTAGRAM_REQUEST_RESULT_LIMIT_MAX)
    .default(INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT)
    .describe(
      `Maximum number of results to return (1–${INSTAGRAM_REQUEST_RESULT_LIMIT_MAX}). Defaults to ${INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT}.`,
    ),
});

/**
 * MCP-facing: direct profile lookup by handle/URL only (no discovery fields).
 * Mirrors `fetchFromEntities`'s params 1:1.
 */
export const INSTAGRAM_PROFILE_LOOKUP_SCHEMA = z.object({
  entities: z
    .array(z.string())
    .min(1)
    .max(INSTAGRAM_QUERY_LIMITS.maxEntities)
    .refine(
      (entities) =>
        entities.every(
          (entity) =>
            INSTAGRAM_USERNAME_REGEX.test(entity) ||
            INSTAGRAM_URL_REGEX.test(entity),
        ),
      { message: INSTAGRAM_ERROR_MESSAGES.INVALID_ENTITY_FORMAT },
    )
    .describe(
      "Instagram usernames (e.g. 'adidas') or full profile URLs (e.g. 'https://www.instagram.com/adidas') to look up. At least one required; batch up to 100 in a single call instead of calling this tool once per handle.",
    ),
  country: ISO_COUNTRY_CODE_SCHEMA.describe(
    "ISO alpha-2 country used to parse the profile's business phone number into an international format (e.g. IN, US). Does not filter or restrict which profiles are returned.",
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(INSTAGRAM_REQUEST_RESULT_LIMIT_MAX)
    .optional()
    .describe(
      `Max profiles to fetch when more entities are supplied than needed (default ${INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT}).`,
    ),
});

/**
 * MCP-facing: discovery-only variant of `INSTAGRAM_REQUEST_SCHEMA` (drops
 * `entities`, requires `query`). Mirrors `fetchFromQuery`'s params 1:1.
 */
export const INSTAGRAM_PROFILE_SEARCH_SCHEMA = INSTAGRAM_REQUEST_SCHEMA.omit({
  entities: true,
}).extend({
  query: z
    .string()
    .min(1)
    .describe(
      "Free-text description of the type of Instagram profiles to find (e.g. 'fitness coaches in London', 'vegan food bloggers'). Biased toward matching profile page titles, not post/caption content — use search_instagram_content_leads instead when this comes back thin.",
    ),
});
