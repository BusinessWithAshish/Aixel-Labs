export const FACEBOOK_BASE_URL = "https://www.facebook.com";
export const FACEBOOK_MBASIC_BASE_URL = "https://mbasic.facebook.com";

/** Host only — Google `site:` works best without protocol/www. */
export const FACEBOOK_SITE_HOST = "facebook.com";

export const FACEBOOK_GSEARCH_SITE_OPERATOR = `site:${FACEBOOK_SITE_HOST}`;

/**
 * Slim CSE excludes (no trailing slashes). Long `-inurl:/path/` lists burn the
 * Google word budget and return Meta product/reel hubs instead of local Pages.
 * Location precision comes from `fetchGsearch` (`q in City, State` + `gl`).
 */
export const FACEBOOK_GSEARCH_PAGE_EXCLUDE_OPERATORS = [
  "-inurl:posts",
  "-inurl:groups",
  "-inurl:people",
  "-inurl:reel",
  "-inurl:reels",
  "-inurl:watch",
  "-inurl:videos",
  "-inurl:photo",
  "-inurl:events",
  "-inurl:marketplace",
  "-inurl:story.php",
  "-inurl:profile.php",
].join(" ");

export const FACEBOOK_GSEARCH_OR_SEPARATOR = " OR ";
export const FACEBOOK_GSEARCH_EXCLUDE_SEPARATOR = " -";

/** Upper bound for `limit` on Facebook scraper request payloads. */
export const FACEBOOK_REQUEST_RESULT_LIMIT_MAX = 250;
export const FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT = 100;

export const FB_HEADERS: Record<string, string> = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  "cache-control": "no-cache",
  "upgrade-insecure-requests": "1",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"macOS"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  referer: "https://www.google.com/",
};

export const FACEBOOK_QUERY_LIMITS = {
  maxEntities: 100,
  maxQueryWords: 30,
  resultLimitMax: FACEBOOK_REQUEST_RESULT_LIMIT_MAX,
  resultLimitDefault: FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT,
} as const;

/**
 * First path segment values that are Facebook site sections, not Page vanity names.
 */
export const FACEBOOK_RESERVED_FIRST_SEGMENTS = [
  "people",
  "groups",
  "events",
  "watch",
  "marketplace",
  "gaming",
  "reel",
  "reels",
  "photos",
  "photo",
  "photo.php",
  "videos",
  "video",
  "posts",
  "stories",
  "story",
  "login",
  "recover",
  "help",
  "privacy",
  "policies",
  "settings",
  "bookmarks",
  "friends",
  "messages",
  "notifications",
  "search",
  "hashtag",
  "dialog",
  "sharer",
  "share",
  "plugins",
  "tr",
  "ajax",
  "api",
  "ads",
  "business",
  "directory",
  "pages",
  "pg",
  "p",
  "docs",
  "developers",
  "profile.php",
  "permalink.php",
  "story.php",
  "media",
  "home.php",
  "checkpoint",
] as const;

export const FACEBOOK_RESERVED_FIRST_SEGMENT_SET = new Set<string>(
  FACEBOOK_RESERVED_FIRST_SEGMENTS,
);

/** Vanity slug: letters, digits, dots, underscores, hyphens. */
export const FACEBOOK_VANITY_REGEX = /^[a-zA-Z0-9._-]+$/;

export const FACEBOOK_URL_REGEX =
  /https?:\/\/(?:www\.|m\.|mbasic\.)?facebook\.com\/[a-zA-Z0-9._%-]+/i;

export const FACEBOOK_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid query parameters",
  MISSING_QUERY_OR_ENTITIES:
    "Provide a Facebook query or page vanity names/URL(s)",
  ENTITIES_NOT_ARRAY: "Entities must be an array of strings.",
  QUERY_TOO_LONG:
    "Query is too long. Try adjusting the keywords, excludeKeywords, country, state, city, or query.",
  GSEARCH_EMPTY: "Failed to fetch Facebook search results from GSearch.",
  GENERIC: "Facebook API error",
  INVALID_ENTITY_FORMAT:
    "Invalid entity format. Only Facebook page vanity names or URLs are allowed.",
} as const;
