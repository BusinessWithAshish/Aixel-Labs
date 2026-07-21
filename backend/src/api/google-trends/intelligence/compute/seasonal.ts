import {
  GOOGLE_TRENDS_MONTH_NAMES,
  GOOGLE_TRENDS_SEASONAL_INFINITE_RATIO_CAP,
  GOOGLE_TRENDS_SEASONAL_MIN_DISTINCT_MONTHS,
  GOOGLE_TRENDS_SEASONAL_MIN_MONTHS,
  GOOGLE_TRENDS_SEASONAL_MIN_RATIO,
  GOOGLE_TRENDS_SEASONAL_PUBLISH_OFFSET_WEEKS,
  GOOGLE_TRENDS_SECONDS_PER_APPROX_MONTH,
} from "../constants";
import type { GOOGLE_TRENDS_INTEREST_POINT } from "../../interest/types";
import type { GOOGLE_TRENDS_SEASONAL_PATTERN } from "../types";

/** Maps a Unix-seconds timestamp to a 1-indexed month number (1–12). */
function monthOfTimestamp(unixSeconds: number): number {
  return new Date(unixSeconds * 1000).getUTCMonth() + 1;
}

/** Shifts a 1-indexed month back by N weeks, wrapping around Dec→Jan. */
function shiftMonthBack(month: number, weeks: number): number {
  const days = weeks * 7;
  const date = new Date(Date.UTC(2024, month - 1, 15));
  date.setUTCDate(date.getUTCDate() - days);
  return date.getUTCMonth() + 1;
}

/**
 * Detects a seasonal pattern by averaging interest per calendar month and
 * comparing the peak month's average to the trough month's average.
 *
 * Returns `null` when the timeline covers fewer than 12 months or the
 * peak-to-trough ratio is below `GOOGLE_TRENDS_SEASONAL_MIN_RATIO`.
 */
export function detectSeasonalPattern(
  points: GOOGLE_TRENDS_INTEREST_POINT[],
  queryIndex = 0,
): GOOGLE_TRENDS_SEASONAL_PATTERN | null {
  if (points.length < GOOGLE_TRENDS_SEASONAL_MIN_MONTHS) return null;

  // Verify the timeline spans at least 12 months.
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return null;
  const spanMonths =
    (last.time - first.time) / GOOGLE_TRENDS_SECONDS_PER_APPROX_MONTH;
  if (spanMonths < GOOGLE_TRENDS_SEASONAL_MIN_MONTHS) return null;

  const byMonth = new Map<number, number[]>();
  for (const p of points) {
    const m = monthOfTimestamp(p.time);
    const v = p.values[queryIndex] ?? 0;
    const arr = byMonth.get(m) ?? [];
    arr.push(v);
    byMonth.set(m, arr);
  }
  if (byMonth.size < GOOGLE_TRENDS_SEASONAL_MIN_DISTINCT_MONTHS) return null;

  let peakMonth = 1;
  let peakAvg = -Infinity;
  let troughMonth = 1;
  let troughAvg = Infinity;
  for (const [m, arr] of byMonth) {
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    if (avg > peakAvg) {
      peakAvg = avg;
      peakMonth = m;
    }
    if (avg < troughAvg) {
      troughAvg = avg;
      troughMonth = m;
    }
  }

  const rawRatio = troughAvg > 0 ? peakAvg / troughAvg : peakAvg > 0 ? Infinity : 0;
  if (rawRatio < GOOGLE_TRENDS_SEASONAL_MIN_RATIO) return null;

  // Cap an infinite ratio (trough = 0) at a large finite value so the field stays numeric.
  const ratio = Number.isFinite(rawRatio)
    ? rawRatio
    : GOOGLE_TRENDS_SEASONAL_INFINITE_RATIO_CAP;

  const optimalPublishMonth = shiftMonthBack(
    peakMonth,
    GOOGLE_TRENDS_SEASONAL_PUBLISH_OFFSET_WEEKS,
  );

  return {
    peakMonth,
    troughMonth,
    peakToTroughRatio: Math.round(ratio * 100) / 100,
    optimalPublishMonth,
    optimalPublishWindow: `Publish in ${GOOGLE_TRENDS_MONTH_NAMES[optimalPublishMonth - 1]} to build before the ${GOOGLE_TRENDS_MONTH_NAMES[peakMonth - 1]} peak`,
  };
}
