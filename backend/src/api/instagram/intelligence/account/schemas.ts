import { z } from "zod";
import { IG_ADVANCED_POSTS_LIMITS } from "../../advanced/constants";
import { ISO_COUNTRY_CODE_SCHEMA } from "../../../../utils/location-schema";

export const INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA = z.object({
  username: z
    .string()
    .min(1)
    .describe(
      "Instagram username (e.g. 'leomessi') or full profile URL. Fetches this account's profile stats and recent posts together, then computes engagement/velocity intelligence per post.",
    ),
  country: ISO_COUNTRY_CODE_SCHEMA.describe(
    "ISO alpha-2 country for the profile lookup (e.g. IN, US).",
  ),
  pages: z
    .number()
    .int()
    .min(1)
    .max(IG_ADVANCED_POSTS_LIMITS.maxPages)
    .optional()
    .describe(
      `How many pages of posts to fetch (default ${IG_ADVANCED_POSTS_LIMITS.defaultPages}, max ${IG_ADVANCED_POSTS_LIMITS.maxPages}). Start with 1 and only raise it for accounts that clearly need a bigger sample — a single page from a video-heavy account is already a large response.`,
    ),
});
