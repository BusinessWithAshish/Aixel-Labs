export const REDDIT_WEB_ORIGIN = "https://www.reddit.com";
export const REDDIT_OAUTH_ORIGIN = "https://oauth.reddit.com";

/** Page that sets the logged-out `token_v2` cookie (anonymous JWT). */
export const REDDIT_TOKEN_MINT_PATH = "/";
export const REDDIT_TOKEN_COOKIE = "token_v2";
/** Re-mint this long before the JWT `exp`. */
export const REDDIT_TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
/** Used when the JWT has no readable `exp`. */
export const REDDIT_TOKEN_FALLBACK_TTL_MS = 60 * 60 * 1000;

/** Fresh Evomi exits tried when the proxy tunnel fails (HTTP status 0). */
export const REDDIT_SESSION_ATTEMPTS = 3;

/**
 * Pacing for oauth.reddit.com. Measured 2026-10-13: 100 requests per ~5 min
 * window (`X-Ratelimit-*`), plus a short limiter that 429s every 5-10 requests
 * with `Retry-After` of 1-7 s whatever the spacing. A 429 still spends budget.
 */
export const REDDIT_MIN_REQUEST_GAP_MS = 1000;
/** 429s waited out (per `Retry-After`) before the call gives up. */
export const REDDIT_RATE_LIMIT_RETRIES = 4;
/** Used when a 429 carries no `Retry-After`. */
export const REDDIT_RETRY_AFTER_FALLBACK_MS = 5000;
/** Longest a call waits for its turn; past this it fails with 429 instead. */
export const REDDIT_MAX_QUEUE_WAIT_MS = 30_000;

/** In-process response cache, per op. Identical inputs inside the TTL cost no request. */
export const REDDIT_CACHE_TTL_MS = {
  FEED: 60_000,
  POST: 60_000,
  SUBREDDIT: 10 * 60_000,
  USER: 2 * 60_000,
  SEARCH: 2 * 60_000,
  WIKI: 10 * 60_000,
  ARCHIVE: 2 * 60_000,
} as const;
export const REDDIT_CACHE_MAX_ENTRIES = 500;

/** Arctic Shift — community-run Reddit archive. Direct (no proxy), no auth. */
export const REDDIT_ARCHIVE_ORIGIN = "https://arctic-shift.photon-reddit.com";
export const REDDIT_ARCHIVE_USER_AGENT = "aixel-labs-backend/1.0";
export const REDDIT_ARCHIVE_PAGE_SIZE = 100;
export const REDDIT_ARCHIVE_MAX_LIMIT = 1000;
export const REDDIT_ARCHIVE_TIMEOUT_MS = 45_000;
export const REDDIT_ARCHIVE_RATE_LIMIT_RETRIES = 4;
/**
 * Keyword queries are metered by query time: after one ~4 s search the archive
 * answers 422 "Timeout. Maybe slow down a bit" for the next 15-25 s (measured).
 */
export const REDDIT_ARCHIVE_BUSY_WAIT_MS = 8000;

export const REDDIT_ARCHIVE_KIND = {
  POST: "post",
  COMMENT: "comment",
} as const;

export const REDDIT_ARCHIVE_SORT = {
  DESC: "desc",
  ASC: "asc",
} as const;

export const REDDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export const REDDIT_DEFAULT_COUNTRY = "US";
/** Reddit bills one request per page whatever its size, so take the largest. */
export const REDDIT_DEFAULT_LIMIT = 100;
export const REDDIT_MAX_LIMIT = 100;
export const REDDIT_DEFAULT_COMMENT_LIMIT = 200;
export const REDDIT_MAX_COMMENT_LIMIT = 500;
export const REDDIT_DEFAULT_COMMENT_DEPTH = 8;
export const REDDIT_MAX_COMMENT_DEPTH = 10;

export const REDDIT_FEED_SORT = {
  HOT: "hot",
  NEW: "new",
  TOP: "top",
  RISING: "rising",
  CONTROVERSIAL: "controversial",
} as const;

export const REDDIT_USER_SORT = {
  NEW: "new",
  HOT: "hot",
  TOP: "top",
  CONTROVERSIAL: "controversial",
} as const;

export const REDDIT_SEARCH_SORT = {
  RELEVANCE: "relevance",
  HOT: "hot",
  TOP: "top",
  NEW: "new",
  COMMENTS: "comments",
} as const;

export const REDDIT_COMMENT_SORT = {
  CONFIDENCE: "confidence",
  TOP: "top",
  NEW: "new",
  CONTROVERSIAL: "controversial",
  OLD: "old",
  QA: "qa",
} as const;

export const REDDIT_TIME_FILTER = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  YEAR: "year",
  ALL: "all",
} as const;

export const REDDIT_SEARCH_TYPE = {
  POST: "post",
  SUBREDDIT: "subreddit",
  USER: "user",
} as const;

export const REDDIT_USER_CONTENT = {
  OVERVIEW: "overview",
  SUBMITTED: "submitted",
  COMMENTS: "comments",
} as const;

export type RedditFeedSort =
  (typeof REDDIT_FEED_SORT)[keyof typeof REDDIT_FEED_SORT];
export type RedditSearchType =
  (typeof REDDIT_SEARCH_TYPE)[keyof typeof REDDIT_SEARCH_TYPE];
export type RedditArchiveKind =
  (typeof REDDIT_ARCHIVE_KIND)[keyof typeof REDDIT_ARCHIVE_KIND];
export type RedditUserContent =
  (typeof REDDIT_USER_CONTENT)[keyof typeof REDDIT_USER_CONTENT];

/** Sorts that accept `t=` (time filter). */
export const REDDIT_TIMED_SORTS = new Set<string>([
  REDDIT_FEED_SORT.TOP,
  REDDIT_FEED_SORT.CONTROVERSIAL,
]);

export const REDDIT_API_ROUTES = {
  FEED: "/feed",
  POST: "/post",
  SUBREDDIT: "/subreddit",
  USER: "/user",
  SEARCH: "/search",
  WIKI: "/wiki",
  ARCHIVE: "/archive",
} as const;

export const REDDIT_HANDLER_LABELS = {
  FEED: "REDDIT/FEED",
  POST: "REDDIT/POST",
  SUBREDDIT: "REDDIT/SUBREDDIT",
  USER: "REDDIT/USER",
  SEARCH: "REDDIT/SEARCH",
  WIKI: "REDDIT/WIKI",
  ARCHIVE: "REDDIT/ARCHIVE",
} as const;

export const REDDIT_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  TOKEN_FAILED: "Failed to obtain an anonymous Reddit token",
  REQUEST_FAILED: "Reddit request failed",
  TRANSPORT_FAILED: "Proxy connection to Reddit failed",
  BLOCKED: "Reddit blocked the request (needs a residential proxy — check Evomi)",
  RATE_LIMITED: "Reddit rate limit hit — retry later",
  ARCHIVE_FAILED: "Reddit archive request failed",
  ARCHIVE_RATE_LIMITED:
    "Reddit archive rate limit hit — retry later (keyword queries are heavy; a narrower after/before range helps)",
  ARCHIVE_QUERY_SCOPE: "query needs a subreddit or author (or post, for comments)",
  ARCHIVE_POST_SCOPE: "post only applies to kind=comment",
  SUBREDDIT_NOT_FOUND: "Subreddit not found, private, or banned",
  POST_NOT_FOUND: "Post not found",
  USER_NOT_FOUND: "User not found or suspended",
  WIKI_NOT_FOUND: "Wiki page not found or disabled",
  BAD_SUBREDDIT: "Could not parse a subreddit name",
  BAD_POST: "Could not parse a post ID or URL",
  BAD_USER: "Could not parse a username",
} as const;

/** Feeds that are not real subreddits but share the `/r/{name}/{sort}` path. */
export const REDDIT_VIRTUAL_SUBREDDITS = new Set(["popular", "all"]);
