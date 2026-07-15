import { z } from "zod";
import {
  GMAPS_ENRICHMENT_DEFAULTS,
  GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS,
  GMAPS_REQUEST_LIMIT_DEFAULT,
  GMAPS_REQUEST_LIMIT_MAX,
} from "./constants";

/** Empty / NaN number inputs from forms → null (no upper bound). */
const nullableNonNegInt = z.preprocess((val) => {
  if (val === undefined || val === "" || val === null) return null;
  if (typeof val === "number" && Number.isNaN(val)) return null;
  return val;
}, z.number().int().nonnegative().nullable());

export const GMAPS_ENRICHMENT_SCHEMA = z
  .object({
    minRating: z.coerce
      .number()
      .min(0)
      .max(5)
      .default(GMAPS_ENRICHMENT_DEFAULTS.minRating)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.minRating),
    minReviews: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(GMAPS_ENRICHMENT_DEFAULTS.minReviews)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.minReviews),
    maxReviews: nullableNonNegInt
      .default(GMAPS_ENRICHMENT_DEFAULTS.maxReviews)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.maxReviews),
    requirePhone: z
      .boolean()
      .default(GMAPS_ENRICHMENT_DEFAULTS.requirePhone)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.requirePhone),
    requireWebsite: z
      .boolean()
      .default(GMAPS_ENRICHMENT_DEFAULTS.requireWebsite)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.requireWebsite),
    categoryContains: z
      .string()
      .trim()
      .default(GMAPS_ENRICHMENT_DEFAULTS.categoryContains)
      .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.categoryContains),
  })
  .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.enrichment);

/** Fully-resolved enrichment after Zod defaults (no optional fields). */
export type GMAPS_ENRICHMENT = z.output<typeof GMAPS_ENRICHMENT_SCHEMA>;

export const GMAPS_LIMIT_SCHEMA = z.coerce
  .number()
  .int()
  .min(1)
  .max(GMAPS_REQUEST_LIMIT_MAX)
  .default(GMAPS_REQUEST_LIMIT_DEFAULT)
  .describe(GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS.limit);
