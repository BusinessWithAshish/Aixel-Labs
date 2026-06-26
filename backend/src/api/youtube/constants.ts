export const YOUTUBE_BASE_URL = "https://www.youtube.com";

export enum YT_SEARCH_FILTER {
  VIDEO = "video",
  CHANNEL = "channel",
  PLAYLIST = "playlist",
  MOVIE = "movie",
  SHORT = "short",
}

/**
 * YouTube search filter `sp` query param values.
 * These are base64-encoded protobuf filter descriptors.
 */
export const YOUTUBE_SEARCH_FILTER_SP: Record<YT_SEARCH_FILTER, string> = {
  [YT_SEARCH_FILTER.VIDEO]: "EgIQAQ%3D%3D",
  [YT_SEARCH_FILTER.CHANNEL]: "EgIQAg%3D%3D",
  [YT_SEARCH_FILTER.PLAYLIST]: "EgIQAw%3D%3D",
  [YT_SEARCH_FILTER.MOVIE]: "EgIQBA%3D%3D",
  [YT_SEARCH_FILTER.SHORT]: "EgQQARgD",
};

export const YOUTUBE_DEFAULT_TIMEOUT_MS = 30_000;
export const YOUTUBE_DEFAULT_SEARCH_LIMIT = 20;
export const YOUTUBE_MAX_SEARCH_LIMIT = 50;

export const YOUTUBE_SCRAPE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
};
