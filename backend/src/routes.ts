import type { Express } from "express";
import { ENDPOINTS } from "./config";

import instagramRoutes from "./api/instagram/index";
import facebookRoutes from "./api/facebook/index";
import gmapsRoutes from "./api/gmaps/index";
import homeRoutes from "./api/home/index";
import linkedinRoutes from "./api/linkedin";
import youtubeRoutes from "./api/youtube/index";
import gsearchRoutes from "./api/gsearch/index";
import googleTrendsRoutes from "./api/google-trends/index";
import mcpRoutes from "./mcp/router";

export function registerRoutes(app: Express) {
  app.use(ENDPOINTS.HOME, homeRoutes);
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.FACEBOOK, facebookRoutes);
  app.use(ENDPOINTS.LINKEDIN, linkedinRoutes);
  app.use(ENDPOINTS.YOUTUBE, youtubeRoutes);
  app.use(ENDPOINTS.GSEARCH, gsearchRoutes);
  app.use(ENDPOINTS.GOOGLE_TRENDS, googleTrendsRoutes);
  app.use(ENDPOINTS.MCP, mcpRoutes);
}
