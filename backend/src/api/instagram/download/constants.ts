import { AIXEL_MEDIA } from "../../../media";

/**
 * Instagram download — post / reel / carousel media to local disk.
 *
 * Resolution: `GET https://www.instagram.com/p/{shortcode}/` with a Googlebot
 * UA. Instagram serves crawlers server-rendered HTML whose
 * `<script type="application/json">` blobs carry the full v1 feed item
 * (`code`, `media_type`, `video_versions`, `image_versions2`,
 * `carousel_media`) — the same shape the Posts-tab feed returns, so it maps
 * through `advanced/compute/map-post.ts` unchanged. Browser / iPhone /
 * facebookexternalhit UAs, `/embed/captioned/`, `api/v1/media/{pk}/info/`,
 * `?__a=1` and the GraphQL shortcode query all came back empty or 403/404
 * from the VPS (2026-09-10).
 *
 * Everything here is fetched DIRECT — never through Evomi. One SSR page is
 * ~700 KB and a reel is ~10 MB; paying residential bandwidth for either is
 * not worth it, and the direct path is what works.
 */
export const IG_DOWNLOAD_ROUTES = {
  DOWNLOAD: "/download",
} as const;

export const IG_DOWNLOAD_DIR = AIXEL_MEDIA.INSTAGRAM_DOWNLOADS;

export const IG_POST_PAGE_URL = (shortcode: string) =>
  `https://www.instagram.com/p/${shortcode}/`;

export const IG_CRAWLER_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  accept: "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9",
};

/** Plain UA for the CDN (`*.cdninstagram.com`) media GETs. */
export const IG_CDN_HEADERS: Record<string, string> = {
  "user-agent": "Mozilla/5.0",
};

export const IG_DOWNLOAD_LIMITS = {
  maxUrls: 10,
  /** Per-file ceiling. A long reel is tens of MB; this only stops runaways. */
  defaultMaxBytes: 200 * 1024 * 1024,
  maxMaxBytes: 1024 * 1024 * 1024,
  pageTimeoutMs: 30_000,
  mediaTimeoutMs: 5 * 60_000,
} as const;

export const IG_DOWNLOAD_MEDIA_FILTER = ["all", "video", "image"] as const;

export const IG_DOWNLOAD_EXTENSION = {
  video: "mp4",
  image: "jpg",
} as const;

export const IG_DOWNLOAD_FIELD_DESCRIPTIONS = {
  urls: `Instagram post / reel / tv URLs (or bare shortcodes). 1–${IG_DOWNLOAD_LIMITS.maxUrls} per call. Stories and highlights are not supported (login-only).`,
  items:
    "Carousel only: 0-based slide indexes to keep (e.g. [0, 2]). Omit for every slide. Ignored for single-media posts.",
  media:
    "Which asset kinds to save: 'all' (default), 'video' (skip images), or 'image' (skip videos — a reel's cover frame is not saved).",
  maxBytes: `Per-file size ceiling in bytes (default ${IG_DOWNLOAD_LIMITS.defaultMaxBytes}). A file over it is aborted mid-stream and deleted.`,
} as const;

export const IG_DOWNLOAD_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid Instagram download parameters",
  INVALID_URL: "Not an Instagram post/reel URL or shortcode",
  PAGE_FAILED: "Failed to load the Instagram post page",
  NOT_FOUND:
    "Instagram post media not found in the page — private, deleted, age-gated, or Instagram changed the crawler page",
  NO_MATCHING_MEDIA: "Post has no media matching the requested filter",
  MEDIA_FAILED: "Failed to download Instagram media",
  TOO_LARGE: "Instagram media exceeds maxBytes",
  DISK_UNAVAILABLE:
    "Instagram download writes to local disk — not available on this runtime",
  GENERIC: "Instagram download API error",
} as const;
