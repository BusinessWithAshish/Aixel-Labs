import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { gmapsInternalHandler } from "./handler";

export function registerInternalRoutes(router: IRouter) {
  router.post(API_ENDPOINTS.GMAPS.INTERNAL.route, gmapsInternalHandler);
}
