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
import { GMAPS_ADVANCED_DEFAULTS, GMAPS_ADVANCED_ERROR_MESSAGES } from "./constants";
import type { GMAPS_ADVANCED_REQUEST } from "./types";

function leadKey(place: GMAPS_DETAILS_RESPONSE): string | null {
  return place.placeId ?? place.featureId ?? place.id ?? null;
}

/** Batch Maps URLs → place details leads, orchestration shared by HTTP and MCP. */
export async function resolveGmapsAdvancedPlaces(
  req: GMAPS_ADVANCED_REQUEST,
): Promise<GMAPS_DETAILS_RESPONSE[]> {
  const { urls } = req;
  const richness = req.richness ?? GMAPS_ADVANCED_DEFAULTS.RICHNESS;
  const seen = new Set<string>();
  const results: GMAPS_DETAILS_RESPONSE[] = [];

  for (const url of urls) {
    try {
      const placeIdFromUrl = parsePlaceIdFromUrl(url);
      const coords = parseCoordsFromUrl(url);
      const countryCode = parseGlFromUrl(url) ?? GMAPS_DETAILS_DEFAULTS.GL;
      const { data, richness: resolvedRichness } = await fetchGmapsPlaceDetailsRaw({
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
    throw new Error(GMAPS_ADVANCED_ERROR_MESSAGES.NO_RESULTS);
  }

  return results;
}
