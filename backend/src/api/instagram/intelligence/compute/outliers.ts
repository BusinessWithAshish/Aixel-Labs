import { INSTAGRAM_OUTLIER_STDDEV_MULTIPLIER } from "../constants";
import { computeAverage, computeStandardDeviation } from "../math";

/** mean + 2×stddev — same threshold used by the strongest open-source
 * Instagram content-research pipeline found during skill research
 * (bradautomates/head-of-content). Caller is responsible for only passing
 * scores from a single account (see INSTAGRAM_MIN_POSTS_FOR_OUTLIER_DETECTION
 * for the minimum sample size). */
export function computeOutlierThreshold(values: number[]): number | null {
  const avg = computeAverage(values);
  const stddev = computeStandardDeviation(values);
  if (avg === null || stddev === null) return null;
  return avg + INSTAGRAM_OUTLIER_STDDEV_MULTIPLIER * stddev;
}
