export const DEFAULT_PAGE_LOAD_TIMEOUT = 10000;

export const DEFAULT_ELEMENT_LOAD_TIMEOUT = 5000;

export const DEFAULT_BROWSER_TIMEOUT = 60000;

function evomiProxyPort(): number {
  const raw = process.env.EVOMI_PROXY_PORT;
  if (raw === undefined || raw === "") return 1000;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 1000;
}

export const PROXY_CONFIG = {
  PROTOCOL: "http",
  HOSTNAME: process.env.EVOMI_PROXY_HOSTNAME ?? "core-residential.evomi.com",
  PORT: evomiProxyPort(),
  USERNAME: process.env.EVOMI_PROXY_USERNAME ?? "businesswi5",
  PASSWORD: process.env.EVOMI_PROXY_PASSWORD ?? "xYPLYvYQaw22xqDfWfi5",
};
