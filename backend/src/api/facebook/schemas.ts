import { z } from "zod";
import {
  FACEBOOK_ERROR_MESSAGES,
  FACEBOOK_QUERY_LIMITS,
  FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT,
  FACEBOOK_REQUEST_RESULT_LIMIT_MAX,
  FACEBOOK_URL_REGEX,
  FACEBOOK_VANITY_REGEX,
} from "./constants";
import { LOCATION_FIELDS_SCHEMA } from "../../utils/location-schema";

function isValidFacebookEntity(entity: string): boolean {
  const trimmed = entity.trim();
  if (!trimmed) return false;
  if (FACEBOOK_URL_REGEX.test(trimmed)) return true;
  if (trimmed.includes("facebook.com")) return true;
  return FACEBOOK_VANITY_REGEX.test(trimmed.replace(/^@/, ""));
}

export const FACEBOOK_REQUEST_SCHEMA = z.object({
  entities: z
    .array(z.string())
    .max(FACEBOOK_QUERY_LIMITS.maxEntities)
    .optional()
    .refine((entities) => entities?.every(isValidFacebookEntity) ?? true, {
      message: FACEBOOK_ERROR_MESSAGES.INVALID_ENTITY_FORMAT,
    })
    .describe(
      "List of Facebook Page vanity names (e.g. 'Starbucks') or full Page URLs (e.g. 'https://www.facebook.com/Starbucks').",
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Free-text search query describing the type of Facebook Pages to find (e.g. 'dentists in Pune', 'coffee shops Mumbai').",
    ),
  ...LOCATION_FIELDS_SCHEMA.shape,
  keywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords to bias discovery toward matching Pages (e.g. ['clinic', 'dentist']).",
    ),
  excludeKeywords: z
    .array(z.string())
    .optional()
    .describe(
      "Keywords that should NOT appear in discovery results (e.g. ['spam', 'jobs']).",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(FACEBOOK_REQUEST_RESULT_LIMIT_MAX)
    .default(FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT)
    .describe(
      `Maximum number of results to return (1–${FACEBOOK_REQUEST_RESULT_LIMIT_MAX}). Defaults to ${FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT}.`,
    ),
});
