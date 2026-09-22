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
 * Instagram's logged-out web client reads everything through persisted Relay
 * queries on `POST /api/graphql`, and as of Sep 2026 that is the only guest
 * data surface left: `web_profile_info` and `/api/v1/feed/user/…` answer
 * `401 require_login` to every guest — even a real Chrome with a primed
 * session on a clean residential IP — and profile HTML redirects this VPS's
 * datacenter IP to the login page (`is_from_rle`).
 *
 * The endpoint needs no cookies and no priming: any `lsd` value, sent as both
 * the form field and the `x-fb-lsd` header, is accepted. Each `docId` is the
 * `queryID` a logged-out page advertises in its `expectedPreloaders`. They
 * rotate with Instagram builds; a stale one answers "The GraphQL document with
 * ID … was not found", which makes `graphql.ts` rediscover the current ids.
 */
export const IG_GRAPHQL_URL = `${INSTAGRAM_BASE_URL}/api/graphql`;

export const IG_LOGGED_OUT_QUERIES = {
  /** `{ username }` → `xig_user_by_username`: bio, links, follower/following counts. */
  profile: {
    docId: "27981003384861049",
    name: "PolarisLoggedOutDesktopWWWProfileRootContentQuery",
  },
  /** `{ username, first, after? }` → `xig_user_by_username.polaris_ordered_timeline_connection`. */
  posts: {
    docId: "27553725110923321",
    name: "PolarisLoggedOutDesktopWWWProfilePostsTabContentQuery",
  },
  /** `{ username, first, after? }` → `xig_user_by_username.polaris_clips_connection` — the only guest source of `play_count`. */
  reels: {
    docId: "27838951732404191",
    name: "PolarisLoggedOutDesktopWWWProfileReelsTabContentQuery",
  },
  /** `{ media_id }` → `xig_polaris_media.if_not_gated_logged_out`: likes, comments, taken_at, media URLs. */
  media: {
    docId: "28309390568695038",
    name: "PolarisLoggedOutDesktopWWWPostRootContentQuery",
  },
  /**
   * `{ id, ...IG_PROFILE_PAGE_VARIABLES }` → `user`. The logged-in profile page
   * query, which still answers guests: the only guest source of
   * `account_type`, `category` and `hd_profile_pic_url_info`. `address_*`,
   * `media_count` and `is_business` come back null/false to guests. No
   * logged-out page preloads it, so rediscovery finds it in the JS bundles.
   */
  profilePage: {
    docId: "28036671149327607",
    name: "PolarisProfilePageContentQuery",
  },
  /**
   * `{ id }` → `xig_user_by_igid_v2.ayml_logged_out[]`: the "Accounts you might
   * like" / suggested-accounts list a profile page shows a logged-out viewer.
   * Instagram only populates it for notable accounts — it is empty for most
   * small accounts, and that emptiness is Instagram's, not an error. Fired as a
   * live XHR (not preloaded), so rediscovery finds its id in the JS bundles.
   */
  suggested: {
    docId: "26631739266527266",
    name: "PolarisLoggedOutDesktopWWWAYMLQuery",
  },
} as const;

/** Variables the profile page query requires besides `id` (it rejects a request without them). */
export const IG_PROFILE_PAGE_VARIABLES = {
  enable_integrity_filters: true,
  __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
  __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: false,
  __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: false,
  __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false,
  __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
} as const;

/** `account_type` on the profile page query. */
export const IG_ACCOUNT_TYPE = {
  PERSONAL: 1,
  BUSINESS: 2,
  CREATOR: 3,
} as const;

/** Public account whose pages are fetched to rediscover rotated doc ids. */
export const IG_DOC_ID_DISCOVERY_USERNAME = "instagram";

/** The server caps every timeline connection page at 12, whatever `first` asks for. */
export const IG_GRAPHQL_PAGE_SIZE = 12;

/** Parallel GraphQL calls per request — 25 profile lookups at 4 wide took 1.6 s, none refused. */
export const IG_GRAPHQL_CONCURRENCY = 4;

export const IG_GRAPHQL_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/x-www-form-urlencoded",
  origin: INSTAGRAM_BASE_URL,
  referer: `${INSTAGRAM_BASE_URL}/`,
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "x-ig-app-id": IG_APP_ID,
};

/**
 * Profile embed page — served to this VPS without a proxy, and the only guest
 * surface that still carries the account's total post count (`posts_count`).
 */
export const IG_PROFILE_EMBED_URL = (username: string) =>
  `${INSTAGRAM_BASE_URL}/${encodeURIComponent(username)}/embed/`;

/** Top-level document navigation headers, for the embed and discovery pages. */
export const IG_PAGE_HEADERS: Record<string, string> = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
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

/** The AYML (suggested accounts) list tops out around 50; cap and default there. */
export const INSTAGRAM_SUGGESTED_LIMIT_MAX = 50;
export const INSTAGRAM_SUGGESTED_LIMIT_DEFAULT = 50;

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

/** Handles may contain letters, digits, `_` and `.`; a leading `@` is tolerated. */
export const INSTAGRAM_USERNAME_REGEX = /^@?[a-zA-Z0-9._]+$/;
export const INSTAGRAM_URL_REGEX =
  /^(https?:\/\/)?(www\.|m\.)?instagram\.com\/[a-zA-Z0-9._]+/i;

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
  GRAPHQL_FAILED: "Instagram logged-out GraphQL request failed",
  GENERIC: "Instagram API error",
  INVALID_ENTITY_FORMAT:
    "Invalid entity format. Only Instagram usernames or URLs are allowed.",
} as const;
