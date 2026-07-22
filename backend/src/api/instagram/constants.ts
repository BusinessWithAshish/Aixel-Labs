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

export const INSTAGRAM_QUERY_LIMITS = {
  maxEntities: 100,
  /** Google query word cap (same as legacy browser-worker gsearch). */
  maxQueryWords: 30,
} as const;

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
  GENERIC: "Instagram API error",
  INVALID_ENTITY_FORMAT:
    "Invalid entity format. Only Instagram usernames or URLs are allowed.",
} as const;
