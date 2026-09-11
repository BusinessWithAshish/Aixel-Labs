export const DEFAULT_PAGE_LOAD_TIMEOUT = 10000;

export const DEFAULT_ELEMENT_LOAD_TIMEOUT = 5000;

export const DEFAULT_BROWSER_TIMEOUT = 60000;

export const PROXY_CONFIG = {
  PROTOCOL: "http",
  HOSTNAME:
    process.env.EVOMI_PROXY_HOSTNAME ??
    process.env.EVOMI_PROXY_HOST ??
    "core-residential.evomi.com",
  PORT: process.env.EVOMI_PROXY_PORT ?? 1000,
  USERNAME: process.env.EVOMI_PROXY_USERNAME,
  PASSWORD: process.env.EVOMI_PROXY_PASSWORD,
};

/** Global Evomi spend cap — see `evomi-budget.ts`. Off unless both env vars are set. */
export const EVOMI_BUDGET_CONFIG = {
  /** Rolling-24h MB ceiling, e.g. `EVOMI_DAILY_CAP_MB=1000`. */
  CAP_ENV: "EVOMI_DAILY_CAP_MB",
  /** Evomi Public API key (my.evomi.com → settings → API), sent as `x-apikey`. */
  API_KEY_ENV: "EVOMI_PUBLIC_API_KEY",
  USAGE_URL: "https://api.evomi.com/public/usage",
  /** Usage-endpoint product code for Core Residential — what `PROXY_CONFIG` points at. */
  USAGE_PRODUCT: "rpc",
  USER_AGENT: "aixel-backend/1.0",
  REFRESH_MS: 2 * 60_000,
  STALE_AFTER_MS: 30 * 60_000,
  REQUEST_TIMEOUT_MS: 15_000,
  WARN_EVERY_MS: 10 * 60_000,
} as const;
