import { z } from "zod";
import {
  IG_DOWNLOAD_FIELD_DESCRIPTIONS,
  IG_DOWNLOAD_LIMITS,
  IG_DOWNLOAD_MEDIA_FILTER,
} from "./constants";

export const IG_DOWNLOAD_REQUEST_SCHEMA = z.object({
  urls: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(IG_DOWNLOAD_LIMITS.maxUrls)
    .describe(IG_DOWNLOAD_FIELD_DESCRIPTIONS.urls),
  items: z
    .array(z.number().int().min(0))
    .optional()
    .describe(IG_DOWNLOAD_FIELD_DESCRIPTIONS.items),
  media: z
    .enum(IG_DOWNLOAD_MEDIA_FILTER)
    .default("all")
    .describe(IG_DOWNLOAD_FIELD_DESCRIPTIONS.media),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(IG_DOWNLOAD_LIMITS.maxMaxBytes)
    .default(IG_DOWNLOAD_LIMITS.defaultMaxBytes)
    .describe(IG_DOWNLOAD_FIELD_DESCRIPTIONS.maxBytes),
});
