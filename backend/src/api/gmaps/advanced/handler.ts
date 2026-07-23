import type { Request, Response } from "express";
import { ALApiResponse } from "../../types";
import { fetchGmapsPlaceDetailsRaw } from "../details/client";
import { mapPlaceDetails } from "../details/compute";
import {
  parseCoordsFromUrl,
  parseGlFromUrl,
  parsePlaceIdFromUrl,
  parsePlaceNameFromUrl,
} from "../details/parse-place-url";
import { GMAPS_DETAILS_DEFAULTS } from "../details/constants";
import type { GMAPS_DETAILS_RESPONSE } from "../details/types";
import {
  GMAPS_ADVANCED_DEFAULTS,
  GMAPS_ADVANCED_ERROR_MESSAGES,
} from "./constants";
import { GMAPS_ADVANCED_REQUEST_SCHEMA } from "./schemas";

function leadKey(place: GMAPS_DETAILS_RESPONSE): string | null {
  return place.placeId ?? place.featureId ?? place.id ?? null;
}

/** POST /gmaps/advanced — batch Maps URLs → place details leads. */
export async function gmapsAdvancedHandler(req: Request, res: Response) {
  const parsed = GMAPS_ADVANCED_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    const response: ALApiResponse<never> = {
      success: false,
      error:
        parsed.error.issues[0]?.message ??
        GMAPS_ADVANCED_ERROR_MESSAGES.INVALID_PARAMS,
    };
    res.status(400).json(response);
    return;
  }

  const { urls } = parsed.data;
  const richness = parsed.data.richness ?? GMAPS_ADVANCED_DEFAULTS.RICHNESS;
  const seen = new Set<string>();
  const results: GMAPS_DETAILS_RESPONSE[] = [];

  try {
    for (const url of urls) {
      try {
        const placeIdFromUrl = parsePlaceIdFromUrl(url);
        const coords = parseCoordsFromUrl(url);
        const countryCode =
          parseGlFromUrl(url) ?? GMAPS_DETAILS_DEFAULTS.GL;
        const { data, richness: resolvedRichness } =
          await fetchGmapsPlaceDetailsRaw({
            url,
            placeId: placeIdFromUrl ?? undefined,
            name: parsePlaceNameFromUrl(url),
            lat: coords?.lat,
            lng: coords?.lng,
            countryCode,
            richness,
          });
        const place = mapPlaceDetails(data, resolvedRichness);
        if (!place.placeId && !place.featureId && !place.name) continue;
        if (!place.id) {
          place.id = place.placeId ?? place.featureId;
        }
        if (!place.id) continue;

        const key = leadKey(place);
        if (key) {
          if (seen.has(key)) continue;
          seen.add(key);
        }
        results.push(place);
      } catch (err) {
        console.error(`[gmaps/advanced] failed url=${url}`, err);
      }
    }

    if (results.length === 0) {
      const response: ALApiResponse<never> = {
        success: false,
        error: GMAPS_ADVANCED_ERROR_MESSAGES.NO_RESULTS,
      };
      res.status(404).json(response);
      return;
    }

    const response: ALApiResponse<GMAPS_DETAILS_RESPONSE[]> = {
      success: true,
      data: results,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : GMAPS_ADVANCED_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(500).json(response);
  }
}
