export enum ENDPOINTS {
  HOME = "/",
  GMAPS = "/gmaps",
  INSTAGRAM = "/instagram",
  GSEARCH = "/gsearch",
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
  HOME: {
    API: { route: "/", full: `${ENDPOINTS.HOME}` },
  },
  PING: "/v1/ping",
  GMAPS: {
    SCRAPE: { route: "/scrape", full: `${ENDPOINTS.GMAPS}/scrape` },
    INTERNAL: { route: "/internal", full: `${ENDPOINTS.GMAPS}/internal` },
  },
  INSTAGRAM: {
    API: { route: "/", full: `${ENDPOINTS.INSTAGRAM}` },
  },
  GSEARCH: {
    API: { route: "/", full: `${ENDPOINTS.GSEARCH}` },
    DRY_RUN: { route: "/dry-run", full: `${ENDPOINTS.GSEARCH}/dry-run` },
  },
  SAMPLE: {
    API: { route: "/api", full: `${ENDPOINTS.SAMPLE}/api` },
  },
} as const;
