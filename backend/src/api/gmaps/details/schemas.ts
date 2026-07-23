import { z } from "zod";
import {
  GMAPS_DETAILS_DEFAULTS,
  GMAPS_DETAILS_ERROR_MESSAGES,
} from "./constants";

export const GMAPS_DETAILS_REQUEST_SCHEMA = z
  .object({
    placeId: z
      .string()
      .min(1)
      .optional()
      .describe("Google Place ID (ChIJ…)."),
    featureId: z
      .string()
      .min(1)
      .optional()
      .describe("Maps feature id `0x…:0x…` from place URL `!1s`."),
    url: z
      .string()
      .url()
      .optional()
      .describe("Full Google Maps place URL."),
    name: z
      .string()
      .optional()
      .describe("Optional display name passed as `q` on the preview request."),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    countryCode: z
      .string()
      .length(2)
      .optional()
      .describe(
        `ISO 3166-1 alpha-2 country code for \`gl\`. Default ${GMAPS_DETAILS_DEFAULTS.GL}. Optional when resolving from a place url.`,
      ),
    hl: z
      .string()
      .min(2)
      .max(10)
      .optional()
      .describe(
        `Language (hl). Default ${GMAPS_DETAILS_DEFAULTS.HL}.`,
      ),
    richness: z
      .enum(["slim", "rich"])
      .optional()
      .describe(
        `Payload richness. Default ${GMAPS_DETAILS_DEFAULTS.RICHNESS}. Use rich for photos/topics/histogram.`,
      ),
  })
  .superRefine((body, ctx) => {
    if (!body.placeId && !body.featureId && !body.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: GMAPS_DETAILS_ERROR_MESSAGES.MISSING_IDENTIFIER,
        path: ["placeId"],
      });
    }
  });
