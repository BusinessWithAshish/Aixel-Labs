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
      (entities) => {
        return entities?.every(
          (entity) =>
            INSTAGRAM_USERNAME_REGEX.test(entity) ||
            INSTAGRAM_URL_REGEX.test(entity),
        );
      },
      {
        message:
          "Invalid entity format. Only Instagram usernames or URLs are allowed.",
      },
    ),
  query: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  excludeKeywords: z.array(z.string()).optional(),
  excludeHashtags: z.array(z.string()).optional(),
});
