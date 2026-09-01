import type { Express } from "express";
import { ENDPOINTS } from "./config";

import instagramRoutes from "./api/instagram/index";
import facebookRoutes from "./api/facebook/index";
import gmapsRoutes from "./api/gmaps/index";
import homeRoutes from "./api/home/index";
import linkedinRoutes from "./api/linkedin";
import youtubeRoutes from "./api/youtube/index";
import twitterRoutes from "./api/twitter/index";
import gsearchRoutes from "./api/gsearch/index";
import googleTrendsRoutes from "./api/google-trends/index";
import transcriptionRoutes from "./api/transcription/index";
import viralClipperRoutes from "./api/viral-clipper/index";
import tighteningRoutes from "./api/tightening/index";
import crawlRoutes from "./api/crawl/index";
import chatgptRoutes from "./api/chatgpt/index";
import claudeRoutes from "./api/claude/index";
import mcpRoutes from "./mcp/router";

export function registerRoutes(app: Express) {
  app.use(ENDPOINTS.HOME, homeRoutes);
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.FACEBOOK, facebookRoutes);
  app.use(ENDPOINTS.LINKEDIN, linkedinRoutes);
  app.use(ENDPOINTS.YOUTUBE, youtubeRoutes);
  app.use(ENDPOINTS.TWITTER, twitterRoutes);
  app.use(ENDPOINTS.GSEARCH, gsearchRoutes);
  app.use(ENDPOINTS.GOOGLE_TRENDS, googleTrendsRoutes);
  app.use(ENDPOINTS.TRANSCRIPTION, transcriptionRoutes);
  app.use(ENDPOINTS.VIRAL_CLIPPER, viralClipperRoutes);
  app.use(ENDPOINTS.TIGHTENING, tighteningRoutes);
  app.use(ENDPOINTS.CRAWL, crawlRoutes);
  app.use(ENDPOINTS.CHATGPT, chatgptRoutes);
  app.use(ENDPOINTS.CLAUDE, claudeRoutes);
  app.use(ENDPOINTS.MCP, mcpRoutes);
}
