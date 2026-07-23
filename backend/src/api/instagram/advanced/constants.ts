/**
 * Instagram Advanced — posts tab (public profiles).
 *
 * Discovered network calls (profile grid + on-scroll):
 *
 * 1. Seed session cookies from `GET /{username}/`
 * 2. Initial + scroll posts:
 *    `GET /api/v1/feed/user/{username}/username/?count=12[&max_id={cursor}]`
 *    Response: `{ items, more_available, next_max_id, num_results, user, status }`
 *
 * GraphQL alternate (same media shape under `node`):
 *    `POST /graphql/query` doc_id `34030839746560163`
 *    friendly name `PolarisProfilePostsTabContentQuery_connection`
 *    field `data.xdt_api__v1__feed__user_timeline_graphql_connection`
 *    page_info.end_cursor === feed next_max_id
 *
 * `web_profile_info` is currently flaky (400 schema / 401 login wall).
 * Prefer the feed/user REST path for posts pagination.
 */
export const IG_ADVANCED_ROUTES = {
  POSTS: "/advanced/posts",
  SEARCH: "/advanced/search",
  POPULAR: "/advanced/popular",
} as const;

export const IG_ADVANCED_HANDLER_LABELS = {
  POSTS: "instagram-advanced-posts",
  SEARCH: "instagram-advanced-search",
  POPULAR: "instagram-advanced-popular",
} as const;

/** REST path used by the web profile Posts tab (initial + infinite scroll). */
export const IG_FEED_USER_BY_USERNAME_PATH = "/api/v1/feed/user";

/** GraphQL posts-tab connection (scroll) — kept for future / fallback use. */
export const IG_POSTS_CONNECTION_DOC_ID = "34030839746560163";
export const IG_POSTS_CONNECTION_FRIENDLY_NAME =
  "PolarisProfilePostsTabContentQuery_connection";
export const IG_POSTS_CONNECTION_ROOT_FIELD =
  "xdt_api__v1__feed__user_timeline_graphql_connection";

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
  FEED_EMPTY: "Instagram returned no posts for this profile",
  GENERIC: "Instagram advanced posts API error",
} as const;
