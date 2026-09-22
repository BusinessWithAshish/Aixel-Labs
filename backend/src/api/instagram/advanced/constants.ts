/**
 * Instagram Advanced — posts tab (public profiles).
 *
 * Read through the logged-out GraphQL queries in `../constants.ts`
 * (`IG_LOGGED_OUT_QUERIES`): the Posts-tab connection for the grid, the post
 * query for each item's counts and media, the Reels-tab connection for reel
 * play counts. `GET /api/v1/feed/user/{username}/username/` — the REST path
 * this used before — answers `401 require_login` to guests since Sep 2026.
 */
export const IG_ADVANCED_ROUTES = {
  POSTS: "/advanced/posts",
  SEARCH: "/advanced/search",
} as const;

export const IG_ADVANCED_HANDLER_LABELS = {
  POSTS: "instagram-advanced-posts",
  SEARCH: "instagram-advanced-search",
} as const;

/**
 * Post embed page — served to this VPS without a proxy, and the only guest
 * surface that carries a video's `video_view_count` (the feed-era `view_count`).
 */
export const IG_POST_EMBED_URL = (shortcode: string) =>
  `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/`;

/**
 * Reels-tab pages scanned for play counts before giving up (12 reels each).
 * The scan normally stops much earlier, once it pages past the oldest reel.
 */
export const IG_REELS_SCAN_MAX_PAGES = 25;

export const IG_ADVANCED_POSTS_LIMITS = {
  defaultCount: 12,
  maxCount: 50,
  defaultPages: 1,
  maxPages: 20,
} as const;

/** Instagram media_type integers from the v1 feed payload. */
export const IG_MEDIA_TYPE = {
  IMAGE: 1,
  VIDEO: 2,
  CAROUSEL: 8,
} as const;

export const IG_MEDIA_TYPE_LABEL = {
  [IG_MEDIA_TYPE.IMAGE]: "image",
  [IG_MEDIA_TYPE.VIDEO]: "video",
  [IG_MEDIA_TYPE.CAROUSEL]: "carousel",
} as const;

export const IG_ADVANCED_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid Instagram advanced posts parameters",
  MISSING_USERNAME: "Provide an Instagram username or profile URL",
  INVALID_USERNAME: "Invalid Instagram username or profile URL",
  FEED_FAILED: "Failed to fetch Instagram profile posts",
  PROFILE_NOT_FOUND: "Instagram profile not found",
  FEED_EMPTY: "Instagram returned no posts for this profile",
  GENERIC: "Instagram advanced posts API error",
} as const;
