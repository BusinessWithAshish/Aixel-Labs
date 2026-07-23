import { z } from "zod";
import {
  IG_ADVANCED_SEARCH_ERROR_MESSAGES,
  IG_ADVANCED_SEARCH_LIMITS,
  IG_CONTENT_KIND,
} from "./constants";
import { ISO_COUNTRY_CODE_SCHEMA } from "../../../../utils/location-schema";

export const IG_CONTENT_KIND_SCHEMA = z.enum([
  IG_CONTENT_KIND.POST,
  IG_CONTENT_KIND.REEL,
]);

export const IG_ADVANCED_SEARCH_REQUEST_SCHEMA = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Niche / free-text search (e.g. 'salon pune', 'bridal makeup mumbai').",
    ),
  kinds: z
    .array(IG_CONTENT_KIND_SCHEMA)
    .min(1)
    .optional()
    .describe("Content kinds to search via GSearch (default: post + reel)."),
  pages: z
    .number()
    .int()
    .min(1)
    .max(IG_ADVANCED_SEARCH_LIMITS.maxPages)
    .optional()
    .describe("GSearch pages per kind (default 1)."),
  maxResolve: z
    .number()
    .int()
    .min(1)
    .max(IG_ADVANCED_SEARCH_LIMITS.maxResolve)
    .optional()
    .describe("Max post/reel URLs to resolve to handles."),
  enrichProfiles: z
    .boolean()
    .optional()
    .describe(
      "If true, enrich unique handles with the Instagram profile lead API.",
    ),
  country: ISO_COUNTRY_CODE_SCHEMA.optional().describe(
    "ISO country for GSearch + phone parsing (default IN).",
  ),
}).refine((b) => b.query.trim().length > 0, {
  message: IG_ADVANCED_SEARCH_ERROR_MESSAGES.MISSING_QUERY,
  path: ["query"],
});
