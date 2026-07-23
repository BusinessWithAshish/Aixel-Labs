import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { gmapsDetailsHandler } from "./handler";

export type {
  GMAPS_DETAILS_REQUEST,
  GMAPS_DETAILS_RESPONSE,
  GmapsDetailsCommon,
  GmapsDetailsByType,
  GmapsDetailsMeta,
} from "./types";
export { GMAPS_DETAILS_REQUEST_SCHEMA } from "./schemas";
export { fetchGmapsPlaceDetailsRaw, fetchPlacePreview } from "./client";
export {
  parseFeatureIdFromUrl,
  parsePlaceIdFromUrl,
  parseCoordsFromUrl,
  parsePlaceNameFromUrl,
  parseGlFromUrl,
  isValidGoogleMapsPlaceUrl,
} from "./parse-place-url";
export { mapPlaceDetails } from "./compute";
export { GMAPS_DETAILS_ROUTES } from "./constants";

export function registerDetailsRoutes(router: IRouter): void {
  router.post(API_ENDPOINTS.GMAPS.DETAILS.route, gmapsDetailsHandler);
}
