/**
 * Google Search (web) API — constants.
 *
 * This API fetches organic google.com web results **browserless** via the Google
 * Custom Search Element endpoint (`cse.google.com/cse/element/v1`). Discovered
 * from SearXNG's `google_cse` engine (PR #6364, Jul 2026). See ./README.md and
 * `backend/src/experiments/google-search/FINDINGS.md` for the full research.
 */

/** Handler log / error label. */
export const GSEARCH_LABEL = "GSEARCH";

/** Public "search the entire web" CSE id (from blackle.com, as used by SearXNG). */
export const GSEARCH_DEFAULT_CX = "partner-pub-8993703457585266:4862972284";

export const GSEARCH_CSE_JS_URL = (cx: string) =>
  `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;

export const GSEARCH_CSE_ELEMENT_URL = "https://cse.google.com/cse/element/v1";

/** Referer required by the element endpoint. */
export const GSEARCH_REFERER = "https://cse.google.com/";

export const GSEARCH_DEFAULT_LANGUAGE = "en";
export const GSEARCH_DEFAULT_COUNTRY = "US";

/** The element endpoint caps results per page at 20. */
export const GSEARCH_PAGE_SIZE = 20;
export const GSEARCH_DEFAULT_PAGES = 1;
/**
 * Hard ceiling. Google caps the CSE `start` offset at 100 (same as the official
 * CSE JSON API's 100-result limit). With `num=20`, `start=100` returns results
 * 101–120, so 6 pages × 20 = **~120 results max per query**. `start=120+` returns
 * a "Sorry" page even from clean IPs — this is a Google limit, not rate limiting.
 * There is NO way to get 1000 results from a single query via this endpoint.
 */
export const GSEARCH_MAX_PAGES = 6;
/** Max `start` offset Google will serve for CSE. */
export const GSEARCH_MAX_START = 100;

export const GSEARCH_MAX_QUERY_CHARS = 1900;

export const GSEARCH_REQUEST_TIMEOUT_MS = 20_000;
/** Token is valid ~1h; refresh a little early. */
export const GSEARCH_TOKEN_TTL_MS = 55 * 60 * 1000;
/** Pacing between paginated requests to avoid tripping rate limits. */
export const GSEARCH_INTER_PAGE_GAP_MS = 400;

export const GSEARCH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Safe-search levels accepted by the element endpoint. */
export enum GSEARCH_SAFE {
  OFF = "off",
  MEDIUM = "medium",
  HIGH = "high",
}

/**
 * Time filter → number of days back. The CSE element endpoint has **no `tbs`**;
 * it uses a `sort=date:r:<start>:<end>` date range instead (see helpers).
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

/** Experiment flags echoed back into the search request (from cse.js). */
export const GSEARCH_ROUTES = {
  SEARCH: "/",
} as const;
