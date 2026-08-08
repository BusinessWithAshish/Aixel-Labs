/**
 * G-Search v2 — Docs Explore endpoint (browserless KG + organic).
 * See backend/experiments/google-search/COMPETITORS_FINDINGS.md §0 / §10.1.
 */

export const GSEARCH_V2_ROUTES = {
  SEARCH: "/v2",
} as const;

/**
 * Any public Google Doc ID works as a routing key (ownership not validated).
 * Pooled and randomly rotated per request (see `fetchDocsExplore`) — a
 * single shared ID gets soft-throttled by Google under repeated use, which
 * showed up as a ~50% failure rate in smoke testing against one ID alone.
 * Verified reachable via live Docs Explore calls on 2026-08-08.
 */
export const GSEARCH_V2_PUBLIC_DOC_IDS = [
  "1xrLppIQLnhF1YFNK0-BfYdEISoizEnXY",
  "1axeeBWp683LPU8gCBQQqmquHMYHuG3uhNTN0LjSJBKk",
  "1wRKmfS4fbhQDv1XxrJ1NT7KDpcj-wjEqqY76rI1Dovs",
  "1pwuNNIUK1LrJCSSFJotnQqB6rFqnaREJ",
  "13EPodkTngqH9RKg18gMDfkK_bGrg4G9osGPm6HxcseQ",
  "19B-yXT9h9A1hXPugvvmo_X2esoLNWJU5ycqK6Fr65gA",
  "1sk_4qJTF7zGroovB2-JHwcS9x-OABbngmGj_PhNRKfc",
  "1NyBW7UxkVDvqnaNMWgudNe5ttG4Bkr8W",
] as const;

export const GSEARCH_V2_DOCS_EXPLORE_URL = (docId: string) =>
  `https://docs.google.com/document/d/${docId}/explore/search`;

/** Results requested per page (endpoint caps ~85 even if higher). */
export const GSEARCH_V2_PAGE_SIZE = 20;

/** Offset delta encoded in the 2-byte pagination token. */
export const GSEARCH_V2_PAGE_OFFSET_STEP = 20;

export const GSEARCH_V2_XSSI_PREFIX = ")]}'";

/**
 * Docs Explore returns intermittent HTTP 500s over the proxy even on a
 * healthy, unused doc ID (measured ~10-20% baseline in addition to the
 * per-ID throttling GSEARCH_V2_PUBLIC_DOC_IDS pooling addresses). Retrying
 * page 1 with a fresh proxy session + doc ID pushes effective reliability
 * well above a single attempt; pages 2+ stay single-attempt since a
 * mid-pagination failure already degrades gracefully to partial results.
 */
export const GSEARCH_V2_PAGE1_MAX_ATTEMPTS = 3;

export const GSEARCH_V2_HANDLER_LABELS = {
  SEARCH: "GSEARCH_V2",
} as const;

export const GSEARCH_V2_BACKEND = {
  DOCS_EXPLORE: "docs-explore",
  CSE: "cse",
} as const;
