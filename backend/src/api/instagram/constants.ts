export const INSTAGRAM_BASE_URL = "https://www.instagram.com";

/** Host only — Google `site:` works best without protocol/www. */
export const INSTAGRAM_SITE_HOST = "instagram.com";

/**
 * CSE / Google operators that bias results toward profile pages.
 * Profile HTML titles historically include "Instagram photos and videos";
 * bare `site:instagram.com` now returns mostly posts/reels.
 */
export const INSTAGRAM_GSEARCH_SITE_OPERATOR = `site:${INSTAGRAM_SITE_HOST}`;
export const INSTAGRAM_GSEARCH_PROFILE_TITLE_OPERATOR =
  'intitle:"Instagram photos and videos"';

/** Join OR-groups in advanced Google queries. */
export const INSTAGRAM_GSEARCH_OR_SEPARATOR = " OR ";
/** Prefix for exclude-keyword fragments (`-foo -bar`). */
export const INSTAGRAM_GSEARCH_EXCLUDE_SEPARATOR = " -";

export const IG_APP_ID = "936619743392459";

/**
 * `x-asbd-id` is a constant the instagram.com web client pins on every API call.
 * Observed stable across years; missing it is a bot tell for `web_profile_info`.
 */
export const IG_ASBD_ID = "129477";

/**
 * `web_profile_info` returns 401 (`igweb_rollout: true`) to cookieless requests,
 * even from a real browser on a clean IP. The endpoint wants a logged-out guest
 * session: session cookies (csrftoken / mid / datr / ig_did), a matching CSRF
 * double-submit token, and the full Sec-Fetch / client-hint header set Chrome
 * sends. So we first `GET https://www.instagram.com/` to seed the cookie jar,
 * then call the profile endpoint on the same TLS session (sticky proxy IP).
 *
 * Reference: numbersoffice/rss-parser `src/adapters/instagram.ts` (commit ddf99a6),
 * HarvestMyData "Instagram Enrichment Endpoint Guide" (Feb 2026).
 */
export const IG_GUEST_PRIME_URL = `${INSTAGRAM_BASE_URL}/`;

/** Per-profile retry budget; each retry rotates the Evomi sticky session suffix. */
export const IG_PROFILE_MAX_RETRIES = 3;

/** XHR headers for `web_profile_info` — Sec-Fetch / client-hints match the UA. */
export const IG_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  priority: "u=1, i",
  "sec-ch-prefers-color-scheme": "dark",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-full-version-list":
    '"Chromium";v="131.0.6778.267", "Not_A Brand";v="24.0.0.0"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-model": '""',
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-ua-platform-version": '"26.2.0"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "x-ig-app-id": IG_APP_ID,
  "x-ig-www-claim": "0",
  "x-requested-with": "XMLHttpRequest",
  referer: INSTAGRAM_BASE_URL,
};

/**
 * HTML navigation headers for the guest-session prime GET. The Sec-Fetch values
 * here describe a top-level document load (not an XHR), which is what the root
 * page expects; the API XHR headers in `IG_HEADERS` are a different shape.
 */
export const IG_PRIME_HEADERS: Record<string, string> = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  "cache-control": "no-cache",
  priority: "u=0, i",
  "sec-ch-prefers-color-scheme": "dark",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-full-version-list":
    '"Chromium";v="131.0.6778.267", "Not_A Brand";v="24.0.0.0"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-model": '""',
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-ua-platform-version": '"26.2.0"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

export const INSTAGRAM_QUERY_LIMITS = {
  maxEntities: 100,
  /** Google query word cap (same as legacy browser-worker gsearch). */
  maxQueryWords: 30,
} as const;

/** Upper bound for `limit` on Instagram scraper request payloads. */
export const INSTAGRAM_REQUEST_RESULT_LIMIT_MAX = 250;
export const INSTAGRAM_REQUEST_RESULT_LIMIT_DEFAULT = 100;

/**
 * First path segment values that are Instagram site sections, not usernames.
 * Profile URLs use `/{handle}` as the first segment.
 */
export const INSTAGRAM_RESERVED_FIRST_SEGMENTS = [
  "explore",
  "accounts",
  "p",
  "reel",
  "reels",
  "stories",
  "tv",
  "direct",
] as const;

export const INSTAGRAM_RESERVED_FIRST_SEGMENT_SET = new Set<string>(
  INSTAGRAM_RESERVED_FIRST_SEGMENTS,
);

export const INSTAGRAM_WEB_PROFILE_INFO_PATH =
  "/api/v1/users/web_profile_info/";

/**
 * Mobile API gateway host for `web_profile_info`. Instagram's web frontend host
 * (`www.instagram.com`) hardened this endpoint in 2025–2026 (401 to cookieless
 * or mildly-suspicious requests); the mobile gateway `i.instagram.com` serves
 * the same path with the same `x-ig-app-id` and is currently more permissive for
 * logged-out guest calls. We prime the cookie jar on `www.instagram.com/{username}/`
 * (the SSR HTML page, which sets csrftoken/mid/datr/ig_did) then call the
 * profile endpoint on `i.instagram.com` with those cookies passed manually
 * (the session jar is host-scoped, so cross-host cookies must be in the header).
 */
export const INSTAGRAM_MOBILE_API_BASE = "https://i.instagram.com";

export const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const INSTAGRAM_URL_REGEX =
  /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_]+/;

export const INSTAGRAM_HANDLER_LABELS = {
  API: "instagram",
} as const;

export const INSTAGRAM_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid query parameters",
  MISSING_QUERY_OR_ENTITIES:
    "Provide an instagram query or usernames/URL(s)",
  ENTITIES_NOT_ARRAY: "Entities must be an array of strings.",
  QUERY_TOO_LONG:
    "Query is too long. Try adjusting the keywors, hashtags, excludeKeywords, excludeHashtags, country, state, cities, or query.",
  GSEARCH_EMPTY: "Failed to fetch instagram search results from GSearch.",
  PROFILE_MISSING_USER: "Instagram profile response missing user",
  PROFILE_GUEST_SESSION_FAILED:
    "Instagram guest session priming failed (root page unavailable)",
  PROFILE_BLOCKED:
    "Instagram profile lookup blocked (401/403/429) after retrying with rotated session",
  GENERIC: "Instagram API error",
  INVALID_ENTITY_FORMAT:
    "Invalid entity format. Only Instagram usernames or URLs are allowed.",
} as const;
