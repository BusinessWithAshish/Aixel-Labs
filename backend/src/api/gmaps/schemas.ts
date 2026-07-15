import { z } from "zod";
import { GMAPS_FIELD_DESCRIPTIONS } from "./internal/constants";
import {
  GMAPS_ENRICHMENT_DEFAULTS,
  GMAPS_ENRICHMENT_SCHEMA,
  GMAPS_LIMIT_SCHEMA,
} from "./filters";
import { GMAPS_EMPTY, GMAPS_PLACE_TYPE_SCHEMA } from "./place-types";

/** Form may send empty string; coerce to undefined before enum check. */
const optionalPlaceType = z.preprocess(
  (val) => (val === GMAPS_EMPTY || val === null || val === undefined ? undefined : val),
  GMAPS_PLACE_TYPE_SCHEMA.optional(),
);

export const GMAPS_REQUEST_FIELDS_SCHEMA = z.object({
  query: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.query),
  placeType: optionalPlaceType.describe(GMAPS_FIELD_DESCRIPTIONS.placeType),
  country: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.country),
  state: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.state),
  cities: z.array(z.string()).optional().describe(GMAPS_FIELD_DESCRIPTIONS.cities),
  urls: z.array(z.string()).optional().describe(GMAPS_FIELD_DESCRIPTIONS.urls),
  countryCode: z
    .string()
    .length(2)
    .optional()
    .describe(GMAPS_FIELD_DESCRIPTIONS.countryCode),
  enrichment: GMAPS_ENRICHMENT_SCHEMA.default(
    GMAPS_ENRICHMENT_DEFAULTS,
  ).describe(GMAPS_FIELD_DESCRIPTIONS.enrichment),
  limit: GMAPS_LIMIT_SCHEMA.describe(GMAPS_FIELD_DESCRIPTIONS.limit),
});

export const GMAPS_REQUEST_SCHEMA = GMAPS_REQUEST_FIELDS_SCHEMA.superRefine(
  (data, ctx) => {
    const hasQuery = Boolean(data.query?.trim());
    const hasPlaceType = Boolean(data.placeType);
    const hasUrls = Boolean(data.urls?.length);
    if (!hasQuery && !hasPlaceType && !hasUrls) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either placeType, query, or urls is required",
        path: ["query"],
      });
    }
    if (data.country?.trim() && !data.countryCode?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "countryCode is required when country is set",
        path: ["countryCode"],
      });
    }
  },
).describe(GMAPS_FIELD_DESCRIPTIONS.base);
