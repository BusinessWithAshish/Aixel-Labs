/**
 * Instagram Advanced — **content search → leads** (GSearch-first).
 *
 * Breakthrough (anon / no IG login):
 * 1. Google: `site:instagram.com/p {niche}` and `site:instagram.com/reel {niche}`
 * 2. Open each `/p|reel/{shortcode}/` HTML (TLS + proxy)
 * 3. Read owner from `og:url` → `instagram.com/{username}/p|reel/...`
 * 4. Dedupe handles → optional profile enrich via existing Instagram lead API
 *
 * Native IG keyword search (`/explore/search/keyword`) is **login-walled**.
 * Working anon IG endpoint: `GET /api/v1/tags/search/?q=` (hashtag discovery).
 */
export const IG_ADVANCED_SEARCH_ROUTE = "/advanced/search";

export const IG_ADVANCED_SEARCH_HANDLER_LABEL =
  "instagram-advanced-search" as const;

/** Content kinds we target via GSearch path prefixes. */
export const IG_CONTENT_KIND = {
  POST: "post",
  REEL: "reel",
  HASHTAG: "hashtag",
} as const;

export type IgContentKind =
  (typeof IG_CONTENT_KIND)[keyof typeof IG_CONTENT_KIND];

export const IG_CONTENT_KIND_GSEARCH: Record<
  typeof IG_CONTENT_KIND.POST | typeof IG_CONTENT_KIND.REEL,
  string
> = {
  [IG_CONTENT_KIND.POST]: "site:instagram.com/p",
  [IG_CONTENT_KIND.REEL]: "site:instagram.com/reel",
};

export const IG_ADVANCED_SEARCH_LIMITS = {
  defaultPages: 1,
  maxPages: 5,
  /** Max content URLs to resolve to handles per request. */
  maxResolve: 40,
  defaultKinds: [IG_CONTENT_KIND.POST, IG_CONTENT_KIND.REEL] as const,
} as const;

export const IG_TAGS_SEARCH_PATH = "/api/v1/tags/search/";

export const IG_ADVANCED_SEARCH_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid Instagram advanced search parameters",
  MISSING_QUERY: "Provide a search query (niche / keywords)",
  GSEARCH_EMPTY: "No Instagram content found via GSearch for this query",
  GENERIC: "Instagram advanced search API error",
} as const;
