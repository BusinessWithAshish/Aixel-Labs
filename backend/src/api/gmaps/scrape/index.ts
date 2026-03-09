import { gmapsScrapeHandler } from "./handler";
import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";

export function registerScrapeRoutes(router: IRouter) {
  router.post(API_ENDPOINTS.GMAPS.SCRAPE, gmapsScrapeHandler);
}
