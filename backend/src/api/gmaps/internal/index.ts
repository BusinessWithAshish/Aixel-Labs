import type { IRouter } from "express";
import { gmapsInternalHandler } from "./handler";
import { API_ENDPOINTS } from "../../../config";

export function registerInternalRoutes(router: IRouter) {
  router.post(API_ENDPOINTS.GMAPS.INTERNAL, gmapsInternalHandler);
}
