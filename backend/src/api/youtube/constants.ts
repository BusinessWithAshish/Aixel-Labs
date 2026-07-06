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

// ─── Shared route paths (method is always POST) ────────────────────────────────

export const YOUTUBE_API_ROUTES = {
  SEARCH: "/search",
  VIDEO: "/video",
  VIDEO_SUGGESTED: "/video/suggested",
  VIDEO_META: "/video-meta",
  CHANNEL: "/channel",
  HANDLE: "/handle",
} as const;

export const YOUTUBE_VIDEO_META_MAX_BATCH = 100;

export const YOUTUBE_VIDEO_META_CONCURRENCY = 10;