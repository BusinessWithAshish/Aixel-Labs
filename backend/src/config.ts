import { YOUTUBE_API_ROUTES } from "./api/youtube/constants";
import { YOUTUBE_INTELLIGENCE_ROUTES } from "./api/youtube/intelligence/constants";
import { GOOGLE_TRENDS_API_ROUTES } from "./api/google-trends/constants";

export enum ENDPOINTS {
  HOME = "/",
  GMAPS = "/gmaps",
  INSTAGRAM = "/instagram",
  FACEBOOK = "/facebook",
  LINKEDIN = "/linkedin",
  YOUTUBE = "/youtube",
  GSEARCH = "/gsearch",
  GOOGLE_TRENDS = "/google-trends",
  MCP = "/mcp",
  SAMPLE = "/sample",
}

export const ALLOWED_ORIGINS_DEV_REGEX = [
  /^http:\/\/.*\.localhost:3003$/,
  /^https:\/\/.*\.aixellabs\.com$/,
];

export const ALLOWED_ORIGINS_PROD_REGEX = [/^https:\/\/.*\.aixellabs\.com$/];

/**
 * Single config per endpoint: `route` for backend Express, `full` for frontend API calls.
 */
export const API_ENDPOINTS = {
  LINKEDIN: {
    API: { route: "/", full: `${ENDPOINTS.LINKEDIN}` },
  },
  FACEBOOK: {
    API: { route: "/", full: `${ENDPOINTS.FACEBOOK}` },
  },
  HOME: {
    API: { route: "/", full: `${ENDPOINTS.HOME}` },
  },
  PING: "/v1/ping",
  GMAPS: {
    INTERNAL: { route: "/internal", full: `${ENDPOINTS.GMAPS}/internal` },
  },
  INSTAGRAM: {
    API: { route: "/", full: `${ENDPOINTS.INSTAGRAM}` },
  },
  YOUTUBE: {
    SEARCH: {
      route: YOUTUBE_API_ROUTES.SEARCH,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.SEARCH}`,
    },
    SUGGEST: {
      route: YOUTUBE_API_ROUTES.SUGGEST,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.SUGGEST}`,
    },
    VIDEO: {
      route: YOUTUBE_API_ROUTES.VIDEO,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO}`,
    },
    VIDEO_SUGGESTED: {
      route: YOUTUBE_API_ROUTES.VIDEO_SUGGESTED,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_SUGGESTED}`,
    },
    VIDEO_TRANSCRIPT: {
      route: YOUTUBE_API_ROUTES.VIDEO_TRANSCRIPT,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_TRANSCRIPT}`,
    },
    CHANNEL: {
      route: YOUTUBE_API_ROUTES.CHANNEL,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.CHANNEL}`,
    },
    HANDLE: {
      route: YOUTUBE_API_ROUTES.HANDLE,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.HANDLE}`,
    },
    INTELLIGENCE: {
      SEARCH: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.SEARCH,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.SEARCH}`,
      },
      VIDEO: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO}`,
      },
      VIDEO_SUGGESTED: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_SUGGESTED,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_SUGGESTED}`,
      },
      VIDEO_TRANSCRIPT: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_TRANSCRIPT,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.VIDEO_TRANSCRIPT}`,
      },
      CHANNEL: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.CHANNEL,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.CHANNEL}`,
      },
      HANDLE: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.HANDLE,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.HANDLE}`,
      },
      SUGGEST: {
        route: YOUTUBE_INTELLIGENCE_ROUTES.SUGGEST,
        full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_INTELLIGENCE_ROUTES.SUGGEST}`,
      },
    },
  },
  GSEARCH: {
    SEARCH: { route: "/", full: `${ENDPOINTS.GSEARCH}` },
  },
  GOOGLE_TRENDS: {
    TRENDING: {
      route: GOOGLE_TRENDS_API_ROUTES.TRENDING,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.TRENDING}`,
    },
    INTEREST: {
      route: GOOGLE_TRENDS_API_ROUTES.INTEREST,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTEREST}`,
    },
    INTELLIGENCE_INTEREST: {
      route: GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_INTEREST,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_INTEREST}`,
    },
    INTELLIGENCE_COMPARE: {
      route: GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_COMPARE,
      full: `${ENDPOINTS.GOOGLE_TRENDS}${GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_COMPARE}`,
    },
  },
  MCP: {
    ROOT: { route: "/", full: `${ENDPOINTS.MCP}` },
    HEALTH: { route: "/health", full: `${ENDPOINTS.MCP}/health` },
  },
  SAMPLE: {
    API: { route: "/api", full: `${ENDPOINTS.SAMPLE}/api` },
  },
} as const;
