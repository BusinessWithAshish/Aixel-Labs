import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { gmapsAdvancedHandler } from "./handler";

export type { GMAPS_ADVANCED_REQUEST, GMAPS_ADVANCED_RESPONSE } from "./types";
export { GMAPS_ADVANCED_REQUEST_SCHEMA } from "./schemas";
export {
  GMAPS_ADVANCED_ROUTES,
  GMAPS_ADVANCED_LIMITS,
  GMAPS_ADVANCED_DEFAULTS,
  GMAPS_ADVANCED_ERROR_MESSAGES,
} from "./constants";

export function registerAdvancedRoutes(router: IRouter): void {
  router.post(API_ENDPOINTS.GMAPS.ADVANCED.route, gmapsAdvancedHandler);
}
