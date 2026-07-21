import {
  GOOGLE_TRENDS_MOMENTUM_RECENT_START_FRACTION,
  GOOGLE_TRENDS_MOMENTUM_SLOPE_EPSILON,
} from "../constants";
import type { GOOGLE_TRENDS_INTEREST_POINT } from "../../interest/types";
import { computeLinearSlope, extractSeries } from "./series";

/**
 * Computes a momentum score for each query in a comparison set.
 *
 * Momentum = the slope of the linear regression over the last 20% of the
 * timeline, then normalised to a 0–100 scale across the set (highest recent
 * slope = 100).
 */
export function computeMomentumScores(
  points: GOOGLE_TRENDS_INTEREST_POINT[],
  queryCount: number,
): { keywordIndex: number; momentumScore: number; slope: number }[] {
  if (points.length < 2 || queryCount === 0) {
    return Array.from({ length: queryCount }, (_, i) => ({
      keywordIndex: i,
      momentumScore: 0,
      slope: 0,
    }));
  }

  const recentStart = Math.max(
    0,
    Math.floor(points.length * GOOGLE_TRENDS_MOMENTUM_RECENT_START_FRACTION),
  );
  const recentPoints = points.slice(recentStart);

  const slopes: number[] = [];
  for (let q = 0; q < queryCount; q++) {
    const series = extractSeries(recentPoints, q);
    slopes.push(computeLinearSlope(series));
  }

  const maxSlope = Math.max(...slopes, GOOGLE_TRENDS_MOMENTUM_SLOPE_EPSILON);
  return slopes.map((slope, keywordIndex) => ({
    keywordIndex,
    momentumScore: Math.max(0, Math.round((slope / maxSlope) * 100)),
    slope,
  }));
}
