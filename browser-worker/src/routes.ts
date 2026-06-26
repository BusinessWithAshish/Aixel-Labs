import type { Express } from "express";
import { ENDPOINTS } from "./config";
import { gsearchHandler } from "./handlers/gsearch/handler";
import { gmapsScrapeHandler } from "./handlers/gmaps/handler";

export function registerRoutes(app: Express) {
  app.get(ENDPOINTS.PING, (_req, res) => {
    res.json({ success: true, message: "browser-worker is running" });
  });

  app.post(ENDPOINTS.GSEARCH, gsearchHandler);
  app.post(ENDPOINTS.GMAPS_SCRAPE, gmapsScrapeHandler);
}
