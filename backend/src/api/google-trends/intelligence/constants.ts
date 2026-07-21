// ─── Trend direction ───────────────────────────────────────────────────────────

/**
 * Slope thresholds (interest points per step) used to classify trend
 * direction. Below the rising/falling thresholds → "stable".
 */
export const GOOGLE_TRENDS_TREND_DIRECTION = {
  RISING: "rising",
  FALLING: "falling",
  STABLE: "stable",
} as const;

/** Minimum absolute slope (interest points per step) to count as rising/falling. */
export const GOOGLE_TRENDS_TREND_SLOPE_THRESHOLD = 0.5;

/**
 * Minimum fraction of step-to-step deltas that must agree in sign with the
 * overall slope for the direction to be considered "consistent". Below this
 * the direction is downgraded to "stable" (noisy/oscillating series).
 */
export const GOOGLE_TRENDS_TREND_CONSISTENCY_RATIO = 0.6;

// ─── Lifecycle stage ───────────────────────────────────────────────────────────

export const GOOGLE_TRENDS_LIFECYCLE_STAGE = {
  EMERGING: "emerging",
  GROWING: "growing",
  MATURE: "mature",
  DECLINING: "declining",
} as const;

/**
 * Average interest thresholds used by the lifecycle classifier.
 * - `EMERGING_MAX_AVG` → below this is "low" interest.
 * - `MATURE_MIN_AVG` → at/above this is "high" interest.
 */
export const GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS = {
  EMERGING_MAX_AVG: 25,
  MATURE_MIN_AVG: 60,
  /** Slope magnitude (points/step) above which an emerging topic is "strongly positive". */
  EMERGING_MIN_SLOPE: 1.5,
} as const;

// ─── Seasonal pattern detection ────────────────────────────────────────────────

/**
 * Minimum timeframe length (in months) for seasonal pattern detection to
 * run. Below this the seasonalPattern field is null.
 */
export const GOOGLE_TRENDS_SEASONAL_MIN_MONTHS = 12;

/** Minimum distinct calendar months required before seasonal detection runs. */
export const GOOGLE_TRENDS_SEASONAL_MIN_DISTINCT_MONTHS = 6;

/** Minimum peak-to-trough ratio for a pattern to count as "seasonal". */
export const GOOGLE_TRENDS_SEASONAL_MIN_RATIO = 1.5;

/** Weeks to shift the peak month back by to compute the optimal publish window. */
export const GOOGLE_TRENDS_SEASONAL_PUBLISH_OFFSET_WEEKS = 6;

/** Cap for an infinite peak/trough ratio (trough average is 0). */
export const GOOGLE_TRENDS_SEASONAL_INFINITE_RATIO_CAP = 9999;

/** Approximate seconds in a 30-day month (used for span checks). */
export const GOOGLE_TRENDS_SECONDS_PER_APPROX_MONTH = 30 * 86_400;

export const GOOGLE_TRENDS_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

// ─── Geographic concentration ─────────────────────────────────────────────────

/** Share of total interest (0–1) the top 1–2 regions must exceed to be "concentrated". */
export const GOOGLE_TRENDS_GEO_CONCENTRATION_THRESHOLD = 0.6;
export const GOOGLE_TRENDS_GEO_CONCENTRATION_TOP_N = 2;

// ─── Platform comparison (web vs YouTube) ──────────────────────────────────────

/**
 * Minimum web interest (0–100) for a demand-gap signal to be meaningful.
 * Below this the topic is too small on Google for the gap to matter.
 */
export const GOOGLE_TRENDS_DEMAND_GAP_MIN_WEB_INTEREST = 20;

/** YouTube interest (0–100) below which a gap is flagged as a content opportunity. */
export const GOOGLE_TRENDS_DEMAND_GAP_LOW_YOUTUBE_THRESHOLD = 30;

// ─── Rising / momentum / comparison ───────────────────────────────────────────

/** Number of rising related queries returned in the intelligence top-N list. */
export const GOOGLE_TRENDS_RISING_TOP_N = 10;

/**
 * Fraction of the timeline used for recent momentum (last 20% of points).
 * `0.8` means the window starts at 80% through the series.
 */
export const GOOGLE_TRENDS_MOMENTUM_RECENT_START_FRACTION = 0.8;

/** Floor for max-slope normalisation so momentum scores stay finite. */
export const GOOGLE_TRENDS_MOMENTUM_SLOPE_EPSILON = 0.0001;
