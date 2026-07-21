export const YOUTUBE_BASE_URL = "https://www.youtube.com";

/** Default ISO 3166-1 alpha-2 country code for geo routing and InnerTube `gl`. */
export const YOUTUBE_DEFAULT_COUNTRY = "US";

export const YOUTUBE_DEFAULT_LIMIT = 1000;
export const YOUTUBE_MAX_LIMIT = 1000;

export const YOUTUBE_HANDLE_MAX_LENGTH = 100;

export enum YT_SEARCH_FILTER {
  VIDEO = "video",
  CHANNEL = "channel",
}

export enum YOUTUBE_DURATION_BUCKET {
  SHORTS = "shorts",
  SHORT = "short",
  MID = "mid",
  LONG = "long",
}

export enum YOUTUBE_CHANNEL_TIER {
  MICRO = "micro",
  SMALL = "small",
  MID = "mid",
  LARGE = "large",
}

export const YOUTUBE_VIDEO_URL = (videoId: string) =>
  `${YOUTUBE_BASE_URL}/watch?v=${videoId}`;

export const YOUTUBE_CHANNEL_PAGE_URL = (channelId: string) =>
  `${YOUTUBE_BASE_URL}/channel/${channelId}`;

export const YOUTUBE_HANDLE_PAGE_URL = (handle: string) =>
  `${YOUTUBE_BASE_URL}/@${handle}`;

export const YOUTUBE_CHANNEL_CANONICAL_URL = (canonicalBaseUrl: string) =>
  `${YOUTUBE_BASE_URL}${canonicalBaseUrl}`;

/**
 * YouTube search filter `sp` query param values.
 * These are base64-encoded protobuf filter descriptors.
 */
export const YOUTUBE_SEARCH_FILTER_SP: Record<YT_SEARCH_FILTER, string> = {
  [YT_SEARCH_FILTER.VIDEO]: "EgIQAQ%3D%3D",
  [YT_SEARCH_FILTER.CHANNEL]: "EgIQAg%3D%3D",
};

/** YouTube channel ID format (UC + 22 chars) */
export const YOUTUBE_CHANNEL_ID_PATTERN = /UC[a-zA-Z0-9_-]{22}/;

// ─── InnerTube API ───────────────────────────────────────────────────────────

export const YOUTUBE_INNERTUBE_CLIENT_NAME = "WEB";
export const YOUTUBE_INNERTUBE_HL = "en";

export const YOUTUBE_INNERTUBE_JSON_HEADERS = {
  "Content-Type": "application/json",
} as const;

export const YOUTUBE_INNERTUBE_SEARCH_URL = `${YOUTUBE_BASE_URL}/youtubei/v1/search`;
export const YOUTUBE_INNERTUBE_GET_WATCH_URL = `${YOUTUBE_BASE_URL}/youtubei/v1/get_watch`;
export const YOUTUBE_INNERTUBE_NEXT_URL = `${YOUTUBE_BASE_URL}/youtubei/v1/next`;
export const YOUTUBE_INNERTUBE_BROWSE_URL = `${YOUTUBE_BASE_URL}/youtubei/v1/browse`;
export const YOUTUBE_INNERTUBE_PLAYER_URL = `${YOUTUBE_BASE_URL}/youtubei/v1/player`;

// ─── Suggest (autocomplete) API ───────────────────────────────────────────────

/**
 * YouTube autocomplete suggestions endpoint. The same one the YouTube web
 * search box calls as the user types. Returns JSONP wrapped in
 * `window.google.ac.h([...])` when `client=youtube`.
 *
 * Host `suggestqueries-clients6.youtube.com` is the in-page host used by
 * youtube.com; `suggestqueries.google.com` is the legacy host that also works.
 */
export const YOUTUBE_SUGGEST_URL =
  "https://suggestqueries-clients6.youtube.com/complete/search";

/** Dataset identifier — `yt` scopes suggestions to YouTube videos. */
export const YOUTUBE_SUGGEST_DATASET = "yt";

/** Client identifier that yields the JSONP `window.google.ac.h(...)` payload. */
export const YOUTUBE_SUGGEST_CLIENT = "youtube";

/** Default BCP-47 language for suggestions. */
export const YOUTUBE_SUGGEST_DEFAULT_HL = "en";

/** Maximum query length accepted by the suggestions endpoint. */
export const YOUTUBE_SUGGEST_MAX_QUERY_LENGTH = 500;

/**
 * InnerTube API key harvested from the YouTube embed page.
 * Verified live as of 2026-07-21; rotates occasionally.
 */
export const YOUTUBE_INNERTUBE_API_KEY =
  "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

/**
 * iOS InnerTube client config.
 *
 * As of 2026, the WEB and ANDROID clients require attestation (PO Token /
 * BotGuard) for transcript-related requests, which cannot be generated
 * server-side without executing YouTube's obfuscated JavaScript. The iOS
 * client is exempt from this requirement, making it the reliable path for
 * fetching caption tracks and timedtext.
 */
export const YOUTUBE_INNERTUBE_IOS_CLIENT = {
  clientName: "IOS",
  clientVersion: "20.10.38",
  userAgent:
    "com.google.ios.youtube/20.10.38 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)",
  deviceMake: "Apple",
  deviceModel: "iPhone16,2",
  osName: "iOS",
  osVersion: "17.5.1.21F90",
} as const;

// ─── Shared route paths (method is always POST) ────────────────────────────────

export const YOUTUBE_API_ROUTES = {
  SEARCH: "/search",
  SUGGEST: "/suggest",
  VIDEO: "/video",
  VIDEO_SUGGESTED: "/video/suggested",
  VIDEO_META: "/video-meta",
  VIDEO_TRANSCRIPT: "/video/transcript",
  CHANNEL: "/channel",
  HANDLE: "/handle",
} as const;

export const YOUTUBE_VIDEO_META_MAX_BATCH = 100;

export const YOUTUBE_VIDEO_META_CONCURRENCY = 10;

// ─── Handler log / error labels ───────────────────────────────────────────────

export const YOUTUBE_HANDLER_LABELS = {
  SEARCH: "YOUTUBE/SEARCH",
  SUGGEST: "YOUTUBE/SUGGEST",
  VIDEO: "YOUTUBE/VIDEO",
  VIDEO_SUGGESTED: "YOUTUBE/VIDEO/SUGGESTED",
  VIDEO_META: "YOUTUBE/VIDEO-META",
  VIDEO_TRANSCRIPT: "YOUTUBE/VIDEO/TRANSCRIPT",
  CHANNEL: "YOUTUBE/CHANNEL",
  HANDLE: "YOUTUBE/HANDLE",
} as const;

// ─── YouTube renderer enum-like strings ──────────────────────────────────────

export const YOUTUBE_BADGE_STYLES = {
  VERIFIED: "BADGE_STYLE_TYPE_VERIFIED",
} as const;

export const YOUTUBE_LOCKUP_CONTENT_TYPES = {
  VIDEO: "LOCKUP_CONTENT_TYPE_VIDEO",
} as const;

export const YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS = {
  COMMENTS: "engagement-panel-comments-section",
} as const;

export const YOUTUBE_COMMENTS_DISABLED_MARKER = "Comments are turned off";

export const YOUTUBE_VERIFIED_ACCESSIBILITY_MARKER = "Verified";
