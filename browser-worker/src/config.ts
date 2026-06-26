export const PORT = process.env.PORT || 8080;

export const ENDPOINTS = {
  PING: "/ping",
  GSEARCH: "/gsearch",
  GMAPS_SCRAPE: "/gmaps/scrape",
} as const;
