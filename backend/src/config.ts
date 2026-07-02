import { YOUTUBE_API_ROUTES } from "./api/youtube/constants";

export enum ENDPOINTS {
  HOME = "/",
  GMAPS = "/gmaps",
  INSTAGRAM = "/instagram",
  LINKEDIN = "/linkedin",
  YOUTUBE = "/youtube",
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
    VIDEO: {
      route: YOUTUBE_API_ROUTES.VIDEO,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO}`,
    },
    VIDEO_SUGGESTED: {
      route: YOUTUBE_API_ROUTES.VIDEO_SUGGESTED,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.VIDEO_SUGGESTED}`,
    },
    CHANNEL: {
      route: YOUTUBE_API_ROUTES.CHANNEL,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.CHANNEL}`,
    },
    HANDLE: {
      route: YOUTUBE_API_ROUTES.HANDLE,
      full: `${ENDPOINTS.YOUTUBE}${YOUTUBE_API_ROUTES.HANDLE}`,
    },
  },
  SAMPLE: {
    API: { route: "/api", full: `${ENDPOINTS.SAMPLE}/api` },
  },
} as const;
