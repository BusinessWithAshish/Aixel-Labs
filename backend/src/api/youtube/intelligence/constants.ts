import { YOUTUBE_CHANNEL_TIER, YOUTUBE_DURATION_BUCKET } from "../constants";

// ─── Intelligence route paths (method is always POST) ────────────────────────

export const YOUTUBE_INTELLIGENCE_ROUTES = {
  SEARCH: "/intelligence/search",
  VIDEO: "/intelligence/video",
  VIDEO_SUGGESTED: "/intelligence/video/suggested",
  CHANNEL: "/intelligence/channel",
  HANDLE: "/intelligence/handle",
} as const;

// ─── Handler labels (logging + error messages) ───────────────────────────────

export const YOUTUBE_INTELLIGENCE_HANDLER_LABELS = {
  SEARCH: "YOUTUBE/INTELLIGENCE/SEARCH",
  VIDEO: "YOUTUBE/INTELLIGENCE/VIDEO",
  VIDEO_SUGGESTED: "YOUTUBE/INTELLIGENCE/VIDEO/SUGGESTED",
  CHANNEL: "YOUTUBE/INTELLIGENCE/CHANNEL",
  HANDLE: "YOUTUBE/INTELLIGENCE/HANDLE",
} as const;

// ─── Time ────────────────────────────────────────────────────────────────────

export const MS_PER_DAY = 86_400_000;

export const YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS = {
  RECENT: 30,
  EXTENDED: 90,
} as const;

export const YOUTUBE_DECAY_VELOCITY_BASE_DAYS = 30;

// ─── Duration classification (seconds) ───────────────────────────────────────

export const YOUTUBE_SHORT_MAX_SECONDS = 60;

export const YOUTUBE_DURATION_THRESHOLDS_SECONDS = {
  SHORTS_MAX_EXCLUSIVE: YOUTUBE_SHORT_MAX_SECONDS,
  SHORT_MAX_EXCLUSIVE: 300,
  MID_MAX_EXCLUSIVE: 1200,
} as const;

export const YOUTUBE_DURATION_BUCKET_ORDER = [
  YOUTUBE_DURATION_BUCKET.SHORTS,
  YOUTUBE_DURATION_BUCKET.SHORT,
  YOUTUBE_DURATION_BUCKET.MID,
  YOUTUBE_DURATION_BUCKET.LONG,
] as const;

// ─── Channel tier classification (subscribers) ───────────────────────────────

export const YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS = {
  MICRO_MAX_EXCLUSIVE: 10_000,
  SMALL_MAX_EXCLUSIVE: 100_000,
  MID_MAX_EXCLUSIVE: 1_000_000,
} as const;

export const YOUTUBE_CHANNEL_TIER_ORDER = [
  YOUTUBE_CHANNEL_TIER.MICRO,
  YOUTUBE_CHANNEL_TIER.SMALL,
  YOUTUBE_CHANNEL_TIER.MID,
  YOUTUBE_CHANNEL_TIER.LARGE,
] as const;

// ─── Recent velocity trend ───────────────────────────────────────────────────

export const YOUTUBE_RECENT_VELOCITY_TREND = {
  ACCELERATING: "accelerating",
  STABLE: "stable",
  DECELERATING: "decelerating",
} as const;

export const YOUTUBE_RECENT_VELOCITY_TREND_RATIOS = {
  ACCELERATING: 1.1,
  DECELERATING: 0.9,
} as const;

// ─── Percentile levels ───────────────────────────────────────────────────────

export const YOUTUBE_PERCENTILE_LEVELS = {
  P25: 0.25,
  P50: 0.5,
  P75: 0.75,
  P90: 0.9,
} as const;

// ─── Text patterns ───────────────────────────────────────────────────────────

export const YOUTUBE_INTELLIGENCE_PATTERNS = {
  HASHTAG: /#[\w-]+/g,
  TITLE_YEAR: /\b(19|20)\d{2}\b/,
  TITLE_HAS_NUMBER: /\d/,
  TITLE_HAS_QUESTION: /\?/,
  TITLE_WORDS: /\s+/,
  CHANNEL_KEYWORDS: /"([^"]+)"|(\S+)/g,
  CHANNEL_JOINED_DATE_PREFIX: /^Joined\s+/i,
} as const;
