import { z } from "zod";
import {
  IG_ADVANCED_ERROR_MESSAGES,
  IG_ADVANCED_POSTS_LIMITS,
} from "./constants";

export const IG_ADVANCED_POSTS_REQUEST_SCHEMA = z.object({
  username: z
    .string()
    .min(1)
    .describe(
      "Instagram username (e.g. 'leomessi') or full profile URL (e.g. 'https://www.instagram.com/leomessi/').",
    ),
  cursor: z
    .string()
    .optional()
    .describe(
      "Pagination cursor from a previous response (`pageInfo.endCursor` / Instagram `next_max_id`). Omit for the first page.",
    ),
  count: z
    .number()
    .int()
    .min(1)
    .max(IG_ADVANCED_POSTS_LIMITS.maxCount)
    .optional()
    .describe(
      `Posts per page (default ${IG_ADVANCED_POSTS_LIMITS.defaultCount}, max ${IG_ADVANCED_POSTS_LIMITS.maxCount}).`,
    ),
  pages: z
    .number()
    .int()
    .min(1)
    .max(IG_ADVANCED_POSTS_LIMITS.maxPages)
    .optional()
    .describe(
      `How many pages to fetch in one request (default ${IG_ADVANCED_POSTS_LIMITS.defaultPages}, max ${IG_ADVANCED_POSTS_LIMITS.maxPages}).`,
    ),
}).refine((body) => body.username.trim().length > 0, {
  message: IG_ADVANCED_ERROR_MESSAGES.MISSING_USERNAME,
  path: ["username"],
});
