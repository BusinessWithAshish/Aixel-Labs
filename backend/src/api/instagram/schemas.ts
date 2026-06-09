import { z } from "zod";
import {
  INSTAGRAM_USERNAME_REGEX,
  INSTAGRAM_URL_REGEX,
  INSTAGRAM_QUERY_LIMITS,
} from "./constants";

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
        message:
          "Invalid entity format. Only Instagram usernames or URLs are allowed.",
      },
    )
    .describe(
      "List of Instagram usernames (e.g. 'nike') or full profile URLs (e.g. 'https://www.instagram.com/nike'). Populate this when the user provides specific accounts to look up.",
    ),
  query: z
    .string()
    .optional()
    .describe(
      "Free-text search query describing the type of profiles to find (e.g. 'fitness coaches in London', 'vegan food bloggers').",
    ),
  country: z
    .string()
    .optional()
    .describe(
      "Full country name to restrict the search geographically (e.g. 'India', 'United States').",
    ),
  city: z
    .string()
    .optional()
    .describe(
      "City name to restrict the search geographically (e.g. 'Mumbai', 'New York'). Use alongside country when possible.",
    ),
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
});
