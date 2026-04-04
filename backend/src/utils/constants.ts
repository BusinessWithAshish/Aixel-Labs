export const DEFAULT_PAGE_LOAD_TIMEOUT = 10000;

export const DEFAULT_ELEMENT_LOAD_TIMEOUT = 5000;

export const DEFAULT_BROWSER_TIMEOUT = 60000;

export const PROXY_CONFIG = {
  PROTOCOL: "http",
  HOSTNAME: process.env.EVOMI_PROXY_HOSTNAME ?? "core-residential.evomi.com",
  PORT: process.env.EVOMI_PROXY_PORT ?? 1000,
  USERNAME: process.env.EVOMI_PROXY_USERNAME ?? "businesswi5",
  PASSWORD: process.env.EVOMI_PROXY_PASSWORD ?? "xYPLYvYQaw22xqDfWfi5",
};
