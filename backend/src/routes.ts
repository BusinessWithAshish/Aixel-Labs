import type { Express } from "express";
import { ENDPOINTS } from "./config";

import instagramRoutes from "./api/instagram/index";
import gmapsRoutes from "./api/gmaps/index";
import homeRoutes from "./api/home/index";
import linkedinRoutes from "./api/linkedin";
import youtubeRoutes from "./api/youtube/index";

export function registerRoutes(app: Express) {
  app.use(ENDPOINTS.HOME, homeRoutes);
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.LINKEDIN, linkedinRoutes);
  app.use(ENDPOINTS.YOUTUBE, youtubeRoutes);
}
