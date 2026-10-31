import type { Express } from "express";
import { gsearchHandler } from "./gsearch/handler";
import { gmapsScrapeHandler } from "./gmaps/handler";

const ENDPOINTS = {
  PING: "/ping",
  GSEARCH: "/gsearch",
  GMAPS_SCRAPE: "/gmaps/scrape",
} as const;

/** Not mounted today. See README.md before calling this: the handlers have no auth. */
export function registerBrowserRoutes(app: Express, prefix = "/v1/browser") {
  app.get(`${prefix}${ENDPOINTS.PING}`, (_req, res) => {
    res.json({ success: true, message: "browser module is loaded" });
  });

  app.post(`${prefix}${ENDPOINTS.GSEARCH}`, gsearchHandler);
  app.post(`${prefix}${ENDPOINTS.GMAPS_SCRAPE}`, gmapsScrapeHandler);
}
