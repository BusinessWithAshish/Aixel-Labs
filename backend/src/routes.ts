import type { Express } from "express";
import { ENDPOINTS } from "./config";

import instagramRoutes from "./api/instagram/index";
import facebookRoutes from "./api/facebook/index";
import gmapsRoutes from "./api/gmaps/index";
import homeRoutes from "./api/home/index";
import linkedinRoutes from "./api/linkedin";
import youtubeRoutes from "./api/youtube/index";
import twitterRoutes from "./api/twitter/index";
import redditRoutes from "./api/reddit/index";
import gsearchRoutes from "./api/gsearch/index";
import googleTrendsRoutes from "./api/google-trends/index";
import mediaRoutes from "./api/media/index";
import segmentRoutes from "./api/segment/index";
import crawlRoutes from "./api/crawl/index";
import contentLabRoutes from "./api/content-lab/index";
import lineFinderRoutes from "./api/line-finder/index";
import bluffRoutes from "./api/bluff/index";
import businessRoutes from "./api/business/index";
import chatgptRoutes from "./api/chatgpt/index";
import claudeRoutes from "./api/claude/index";
import geminiRoutes from "./api/gemini/index";
import mcpRoutes from "./mcp/router";

/**
 * Which part of the backend this process serves. On the VPS each service runs as its
 * own process (`backend/deploy/aixel-labs-<service>@.service` sets it), so a deploy of
 * one never restarts the other. Unset (local dev, Vercel): everything.
 */
export type AixelLabsService = "api" | "games";
export const AIXEL_LABS_SERVICE = process.env.AIXEL_LABS_SERVICE as AixelLabsService | undefined;
export const servesApi = AIXEL_LABS_SERVICE !== "games";
export const servesGames = AIXEL_LABS_SERVICE !== "api";

export function registerRoutes(app: Express) {
  // The games' room routes read the same in-memory rooms as their sockets, so they live in the games process.
  if (servesGames) {
    app.use(ENDPOINTS.BUSINESS, businessRoutes);
    app.use(ENDPOINTS.BLUFF, bluffRoutes);
  }
  if (!servesApi) return;
  app.use(ENDPOINTS.HOME, homeRoutes);
  app.use(ENDPOINTS.GMAPS, gmapsRoutes);
  app.use(ENDPOINTS.INSTAGRAM, instagramRoutes);
  app.use(ENDPOINTS.FACEBOOK, facebookRoutes);
  app.use(ENDPOINTS.LINKEDIN, linkedinRoutes);
  app.use(ENDPOINTS.YOUTUBE, youtubeRoutes);
  app.use(ENDPOINTS.TWITTER, twitterRoutes);
  app.use(ENDPOINTS.REDDIT, redditRoutes);
  app.use(ENDPOINTS.GSEARCH, gsearchRoutes);
  app.use(ENDPOINTS.GOOGLE_TRENDS, googleTrendsRoutes);
  app.use(ENDPOINTS.MEDIA, mediaRoutes);
  app.use(ENDPOINTS.SEGMENT, segmentRoutes);
  app.use(ENDPOINTS.CRAWL, crawlRoutes);
  app.use(ENDPOINTS.CONTENT_LAB, contentLabRoutes);
  app.use(ENDPOINTS.LINE_FINDER, lineFinderRoutes);
  app.use(ENDPOINTS.CHATGPT, chatgptRoutes);
  app.use(ENDPOINTS.CLAUDE, claudeRoutes);
  app.use(ENDPOINTS.GEMINI, geminiRoutes);
  app.use(ENDPOINTS.MCP, mcpRoutes);
}
