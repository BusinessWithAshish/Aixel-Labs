import type { Express } from "express";

import instagramRoutes from "./api/instagram/index";
import gsearchRoutes from "./api/gsearch/index";
import gmapsRoutes from "./api/gmaps/index";
import { ENDPOINTS } from "./config";

export function registerRoutes(app: Express) {
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.GSEARCH, gsearchRoutes);
}
