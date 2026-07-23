import { z } from "zod";
import { isValidGoogleMapsPlaceUrl } from "../details/parse-place-url";
import {
  GMAPS_ADVANCED_DEFAULTS,
  GMAPS_ADVANCED_ERROR_MESSAGES,
  GMAPS_ADVANCED_LIMITS,
} from "./constants";

export const GMAPS_ADVANCED_REQUEST_SCHEMA = z.object({
  urls: z
    .array(z.string().trim().min(1))
    .min(1)
    .max(GMAPS_ADVANCED_LIMITS.maxUrls)
    .refine((urls) => urls.every(isValidGoogleMapsPlaceUrl), {
      message: GMAPS_ADVANCED_ERROR_MESSAGES.INVALID_URL,
    })
    .describe("Google Maps place URLs to resolve into detailed place leads."),
  richness: z
    .enum(["slim", "rich"])
    .optional()
    .describe(
      `Payload richness. Default ${GMAPS_ADVANCED_DEFAULTS.RICHNESS}.`,
    ),
});
