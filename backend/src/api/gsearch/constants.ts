/**
 * Google Search (web) API — constants.
 *
 * Browserless organic google.com results via the Google Custom Search Element
 * endpoint (`cse.google.com/cse/element/v1`). See ./README.md and
 * `backend/src/experiments/google-search/FINDINGS.md` for research context.
 */

// ─── URLs ────────────────────────────────────────────────────────────────────

export const GSEARCH_CSE_BASE_URL = "https://cse.google.com";

export const GSEARCH_CSE_JS_URL = (cx: string) =>
  `${GSEARCH_CSE_BASE_URL}/cse.js?cx=${encodeURIComponent(cx)}`;

export const GSEARCH_CSE_ELEMENT_URL = `${GSEARCH_CSE_BASE_URL}/cse/element/v1`;

/** Referer required by the element endpoint. */
export const GSEARCH_REFERER = `${GSEARCH_CSE_BASE_URL}/`;

// ─── Defaults & limits ───────────────────────────────────────────────────────

/** Public "search the entire web" CSE id (from blackle.com, as used by SearXNG). */
export const GSEARCH_DEFAULT_CX = "partner-pub-8993703457585266:4862972284";

export const GSEARCH_DEFAULT_LANGUAGE = "en";
export const GSEARCH_DEFAULT_COUNTRY = "US";
export const GSEARCH_DEFAULT_PAGES = 1;

/** The element endpoint caps results per page at 20. */
export const GSEARCH_PAGE_SIZE = 20;

/**
 * Hard ceiling. Google caps the CSE `start` offset at 100 (same as the official
 * CSE JSON API's 100-result limit). With `num=20`, `start=100` returns results
 * 101–120, so 6 pages × 20 = **~120 results max per query**.
 */
export const GSEARCH_MAX_PAGES = 6;
export const GSEARCH_MAX_START = 100;
export const GSEARCH_MAX_QUERY_CHARS = 1900;

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── HTTP / pacing ───────────────────────────────────────────────────────────

export const GSEARCH_REQUEST_TIMEOUT_MS = 20_000;
/** Token is valid ~1h; refresh a little early. */
export const GSEARCH_TOKEN_TTL_MS = 55 * 60 * 1000;
/** Pacing between paginated requests to avoid tripping rate limits. */
export const GSEARCH_INTER_PAGE_GAP_MS = 400;

export const GSEARCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const GSEARCH_ACCEPT_LANGUAGE = "en-US,en;q=0.9";

// ─── Enums ───────────────────────────────────────────────────────────────────

/** Safe-search levels accepted by the element endpoint. */
export enum GSEARCH_SAFE {
  OFF = "off",
  MEDIUM = "medium",
  HIGH = "high",
}

/**
 * Time filter → number of days back.
 * Applied via Google's `after:YYYY-MM-DD` query operator (primary) plus CSE
 * `sort=date:r:<start>:<end>` (secondary). Plain `sort=date:r` alone is weak on
 * whole-web CSE — see compute/query.
 */
export enum GSEARCH_TIME_FILTER {
  LAST_24_HOURS = "day",
  LAST_WEEK = "week",
  LAST_MONTH = "month",
  LAST_YEAR = "year",
}

export const GSEARCH_TIME_FILTER_DAYS: Record<GSEARCH_TIME_FILTER, number> = {
  [GSEARCH_TIME_FILTER.LAST_24_HOURS]: 1,
  [GSEARCH_TIME_FILTER.LAST_WEEK]: 7,
  [GSEARCH_TIME_FILTER.LAST_MONTH]: 30,
  [GSEARCH_TIME_FILTER.LAST_YEAR]: 365,
};

/** Prefer fresh results — CSE relevance ranking alone surfaces stale hub pages. */
export const GSEARCH_DEFAULT_TIME_FILTER = GSEARCH_TIME_FILTER.LAST_24_HOURS;

// ─── Patterns ────────────────────────────────────────────────────────────────

/** Strip query-highlight markup from Google's formatted URL. */
export const GSEARCH_FORMATTED_URL_HIGHLIGHT_PATTERN = /<\/?b>/g;

/** Detect Google rate-limit errors surfaced from the CSE element endpoint. */
export const GSEARCH_RATE_LIMIT_PATTERN = /HTTP 429|\(429\)/;

// ─── Handler labels ──────────────────────────────────────────────────────────

export const GSEARCH_HANDLER_LABELS = {
  SEARCH: "GSEARCH",
} as const;
