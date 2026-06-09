import { z } from "zod";
import { GMAPS_FIELD_DESCRIPTIONS } from "./internal/constants";

export const GMAPS_REQUEST_FIELDS_SCHEMA = z.object({
  query: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.query),
  country: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.country),
  state: z.string().optional().describe(GMAPS_FIELD_DESCRIPTIONS.state),
  cities: z.array(z.string()).optional().describe(GMAPS_FIELD_DESCRIPTIONS.cities),
  urls: z.array(z.string()).optional().describe(GMAPS_FIELD_DESCRIPTIONS.urls),
  countryCode: z.string().length(2).optional().describe(GMAPS_FIELD_DESCRIPTIONS.countryCode),
});

export const GMAPS_REQUEST_SCHEMA = GMAPS_REQUEST_FIELDS_SCHEMA.superRefine(
  (data, ctx) => {
    const hasQuery = Boolean(data.query?.trim());
    const hasUrls = Boolean(data.urls?.length);
    if (!hasQuery && !hasUrls) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either query or urls is required",
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
