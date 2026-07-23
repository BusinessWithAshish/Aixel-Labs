/**
 * Instagram Advanced — **Popular topic search** (native IG, no GSearch).
 *
 * Public surface (logged-out works in real Chrome / Puppeteer):
 *   https://www.instagram.com/popular/{keyword}/
 *
 * Browser network notes:
 * - Route: `PolarisLoggedOutPopularSearchRoute`
 * - GraphQL: `POST https://www.instagram.com/api/graphql`
 * - Related keywords pagination:
 *   friendly `PolarisLoggedOutPopularSearchPageRelatedKeywordsPaginationQuery`
 *   doc_id `27213343048290838`
 *   variables `{ keyword, related_keywords_count, related_keywords_cursor }`
 *
 * Initial reel grid is client-rendered; TLS HTML alone is a shell.
 * We extract the grid via headless Chrome (+ Evomi proxy).
 */
export const IG_POPULAR_ROUTE = "/advanced/popular";

export const IG_POPULAR_HANDLER_LABEL = "instagram-advanced-popular" as const;

export const IG_POPULAR_PATH_PREFIX = "/popular/";

export const IG_POPULAR_RELATED_KEYWORDS_DOC_ID = "27213343048290838";
export const IG_POPULAR_RELATED_KEYWORDS_FRIENDLY =
  "PolarisLoggedOutPopularSearchPageRelatedKeywordsPaginationQuery";

export const IG_POPULAR_LIMITS = {
  defaultMaxReels: 24,
  maxReels: 60,
  navigationTimeoutMs: 60_000,
} as const;

export const IG_POPULAR_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid Instagram popular search parameters",
  MISSING_QUERY: "Provide a popular-topic query (e.g. 'salon')",
  PAGE_FAILED: "Failed to load Instagram popular topic page",
  EMPTY: "No reels found on Instagram popular topic page",
  GENERIC: "Instagram popular search API error",
} as const;
