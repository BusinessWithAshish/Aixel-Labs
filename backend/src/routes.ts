import type { Express } from "express";
import { ENDPOINTS } from "./config";

import instagramRoutes from "./api/instagram/index";
import gsearchRoutes from "./api/gsearch/index";
import gmapsRoutes from "./api/gmaps/index";

import homeRoutes from "./api/home/index";

export function registerRoutes(app: Express) {
  app.use(ENDPOINTS.HOME, homeRoutes);
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.GSEARCH, gsearchRoutes);
}
