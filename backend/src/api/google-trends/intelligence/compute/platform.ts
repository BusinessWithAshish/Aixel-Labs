import {
  GOOGLE_TRENDS_DEMAND_GAP_LOW_YOUTUBE_THRESHOLD,
  GOOGLE_TRENDS_DEMAND_GAP_MIN_WEB_INTEREST,
} from "../constants";
import type { GOOGLE_TRENDS_PLATFORM_COMPARISON } from "../types";

/**
 * Computes the platform comparison demand-gap score from two average interest
 * values (web vs YouTube). Returns `null` when web interest is too low for the
 * signal to be meaningful.
 */
export function computePlatformComparison(
  webInterest: number,
  youtubeInterest: number,
): GOOGLE_TRENDS_PLATFORM_COMPARISON | null {
  if (webInterest < GOOGLE_TRENDS_DEMAND_GAP_MIN_WEB_INTEREST) return null;
  const gap = webInterest - youtubeInterest;
  const isContentOpportunity =
    youtubeInterest < GOOGLE_TRENDS_DEMAND_GAP_LOW_YOUTUBE_THRESHOLD && gap > 0;
  return {
    webInterest,
    youtubeInterest,
    demandGapScore: Math.round(gap * 100) / 100,
    isContentOpportunity,
  };
}
