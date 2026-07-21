import {
  GOOGLE_TRENDS_LIFECYCLE_STAGE,
  GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS,
  GOOGLE_TRENDS_TREND_CONSISTENCY_RATIO,
  GOOGLE_TRENDS_TREND_DIRECTION,
  GOOGLE_TRENDS_TREND_SLOPE_THRESHOLD,
} from "../constants";
import type {
  GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE,
  GOOGLE_TRENDS_TREND_DIRECTION_VALUE,
} from "../types";

/** Classifies the trend direction from slope + consistency. */
export function classifyTrendDirection(
  slope: number,
  consistency: number,
): GOOGLE_TRENDS_TREND_DIRECTION_VALUE {
  const absSlope = Math.abs(slope);
  if (absSlope < GOOGLE_TRENDS_TREND_SLOPE_THRESHOLD) {
    return GOOGLE_TRENDS_TREND_DIRECTION.STABLE;
  }
  if (consistency < GOOGLE_TRENDS_TREND_CONSISTENCY_RATIO) {
    return GOOGLE_TRENDS_TREND_DIRECTION.STABLE;
  }
  return slope > 0
    ? GOOGLE_TRENDS_TREND_DIRECTION.RISING
    : GOOGLE_TRENDS_TREND_DIRECTION.FALLING;
}

/**
 * Classifies the lifecycle stage from average interest, slope, and timeframe.
 *
 * - `emerging`  → low average interest but strongly positive slope.
 * - `growing`   → moderate-to-high interest and positive slope.
 * - `mature`   → high interest but flat slope.
 * - `declining`→ consistently negative slope regardless of absolute interest.
 */
export function classifyLifecycleStage(input: {
  averageInterest: number;
  slope: number;
  direction: GOOGLE_TRENDS_TREND_DIRECTION_VALUE;
  isShortTimeframe: boolean;
}): GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE {
  const { averageInterest, slope, direction, isShortTimeframe } = input;

  if (direction === GOOGLE_TRENDS_TREND_DIRECTION.FALLING) {
    return GOOGLE_TRENDS_LIFECYCLE_STAGE.DECLINING;
  }

  if (
    averageInterest < GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS.EMERGING_MAX_AVG &&
    slope > 0 &&
    isShortTimeframe &&
    slope >= GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS.EMERGING_MIN_SLOPE
  ) {
    return GOOGLE_TRENDS_LIFECYCLE_STAGE.EMERGING;
  }

  if (
    averageInterest >= GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS.MATURE_MIN_AVG &&
    direction === GOOGLE_TRENDS_TREND_DIRECTION.STABLE
  ) {
    return GOOGLE_TRENDS_LIFECYCLE_STAGE.MATURE;
  }

  if (direction === GOOGLE_TRENDS_TREND_DIRECTION.RISING) {
    return GOOGLE_TRENDS_LIFECYCLE_STAGE.GROWING;
  }

  // Stable slope with moderate interest — treat as mature if high, growing otherwise.
  return averageInterest >= GOOGLE_TRENDS_LIFECYCLE_THRESHOLDS.MATURE_MIN_AVG
    ? GOOGLE_TRENDS_LIFECYCLE_STAGE.MATURE
    : GOOGLE_TRENDS_LIFECYCLE_STAGE.GROWING;
}
