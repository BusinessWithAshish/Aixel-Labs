export const MS_PER_DAY = 86_400_000;
export const SECONDS_PER_DAY = 86_400;

// ─── Intelligence route paths (method is always POST) ─────────────────────

export const INSTAGRAM_INTELLIGENCE_ROUTES = {
  ACCOUNT: "/intelligence/account",
} as const;

// ─── Handler labels (logging + error messages) ─────────────────────────────

export const INSTAGRAM_INTELLIGENCE_HANDLER_LABELS = {
  ACCOUNT: "INSTAGRAM/INTELLIGENCE/ACCOUNT",
} as const;

// ─── Engagement scoring ────────────────────────────────────────────────────

/** likes×1 + comments×3 + views×0.1 — same weighting used by the strongest
 * open-source Instagram content-research pipeline found during skill research
 * (bradautomates/head-of-content), adapted with follower normalization below
 * since that pipeline scores accounts of very different sizes without it. */
export const INSTAGRAM_ENGAGEMENT_WEIGHTS = {
  LIKE: 1,
  COMMENT: 3,
  VIEW: 0.1,
} as const;

/** Engagement score is expressed "per N followers" so accounts of very
 * different sizes are comparable. */
export const INSTAGRAM_NORMALIZATION_FOLLOWER_BASIS = 1_000;

export const INSTAGRAM_VELOCITY_MIN_DAYS = 0.5;

// ─── Outlier detection ──────────────────────────────────────────────────────

export const INSTAGRAM_OUTLIER_STDDEV_MULTIPLIER = 2;

/** Below this many posts, mean/stddev aren't meaningful — outlier detection
 * is skipped rather than returning a misleading threshold. */
export const INSTAGRAM_MIN_POSTS_FOR_OUTLIER_DETECTION = 8;

// ─── Percentile levels ───────────────────────────────────────────────────────

export const INSTAGRAM_PERCENTILE_LEVELS = {
  P25: 0.25,
  P50: 0.5,
  P75: 0.75,
} as const;

// ─── Text patterns ───────────────────────────────────────────────────────────

export const INSTAGRAM_INTELLIGENCE_PATTERNS = {
  HASHTAG: /#[\w-]+/g,
} as const;

/** Simple substring CTA detector — a presence flag only, not a classifier.
 * Interpretation of *what kind* of CTA belongs in the analysis layer. */
export const INSTAGRAM_CTA_KEYWORDS = [
  "comment",
  "save this",
  "save it",
  "share this",
  "follow for",
  "link in bio",
  "dm me",
  "tag someone",
  "double tap",
  "swipe up",
] as const;
