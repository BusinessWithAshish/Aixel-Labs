import { z } from "zod";
import {
  IG_POPULAR_ERROR_MESSAGES,
  IG_POPULAR_LIMITS,
} from "./constants";
import { ISO_COUNTRY_CODE_SCHEMA } from "../../../../utils/location-schema";

export const IG_POPULAR_REQUEST_SCHEMA = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        "Popular topic keyword as used in /popular/{query}/ (e.g. 'salon', 'cafe').",
      ),
    maxReels: z
      .number()
      .int()
      .min(1)
      .max(IG_POPULAR_LIMITS.maxReels)
      .optional(),
    enrichProfiles: z
      .boolean()
      .optional()
      .describe("Enrich unique handles via Instagram profile lead API."),
    country: ISO_COUNTRY_CODE_SCHEMA.optional(),
  })
  .refine((b) => b.query.trim().length > 0, {
    message: IG_POPULAR_ERROR_MESSAGES.MISSING_QUERY,
    path: ["query"],
  });
