import type { z } from "zod";
import type { GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA } from "../../interest/schemas";
import { fetchGoogleTrendsCompare } from "../../interest/helpers";
import { GOOGLE_TRENDS_TIMEFRAME } from "../../constants";
import {
  classifyLifecycleStage,
  classifyTrendDirection,
  computeLinearSlope,
  computeMomentumScores,
  computeSeriesAverage,
  computeTrendConsistency,
  detectCrossovers,
  extractSeries,
} from "../compute";
import type {
  GOOGLE_TRENDS_COMPARE_INTELLIGENCE_RESPONSE,
  GOOGLE_TRENDS_COMPARED_QUERY,
  GOOGLE_TRENDS_CROSSOVER_POINT,
  GOOGLE_TRENDS_DOMINANCE_RANKING_ENTRY,
  GOOGLE_TRENDS_MOMENTUM_RANKING_ENTRY,
} from "../types";

export type GoogleTrendsCompareIntelligenceInput = z.infer<
  typeof GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA
>;

/**
 * Fetches Google Trends comparison data for 2–5 keywords and computes the
 * comparison intelligence layer: per-query trend direction + lifecycle stage,
 * relative dominance ranking, momentum comparison, and crossover points.
 *
 * Momentum is the more important signal — a smaller but faster-growing topic
 * is usually the better strategic choice than a larger but flat/declining one.
 */
export async function googleTrendsCompareIntelligenceService(
  input: GoogleTrendsCompareIntelligenceInput,
): Promise<GOOGLE_TRENDS_COMPARE_INTELLIGENCE_RESPONSE> {
  const raw = await fetchGoogleTrendsCompare(input);

  const isShortTimeframe =
    input.timeframe === GOOGLE_TRENDS_TIMEFRAME.LAST_7_DAYS ||
    input.timeframe === GOOGLE_TRENDS_TIMEFRAME.LAST_30_DAYS;

  const keywords = input.keywords;

  const perQuery: GOOGLE_TRENDS_COMPARED_QUERY[] = keywords.map((keyword, q) => {
    const series = extractSeries(raw.interestOverTime, q);
    const slope = computeLinearSlope(series);
    const consistency = computeTrendConsistency(series, slope);
    const direction = classifyTrendDirection(slope, consistency);
    const averageInterest = computeSeriesAverage(series);
    const lifecycleStage = classifyLifecycleStage({
      averageInterest,
      slope,
      direction,
      isShortTimeframe,
    });
    return {
      keyword,
      trendDirection: direction,
      trendSlope: Math.round(slope * 10000) / 10000,
      trendConsistency: Math.round(consistency * 1000) / 1000,
      lifecycleStage,
      averageInterest: Math.round(averageInterest * 100) / 100,
      momentumScore: 0, // filled in below
    };
  });

  // Momentum scores (normalised 0–100 across the comparison set).
  const momentum = computeMomentumScores(raw.interestOverTime, keywords.length);
  for (const m of momentum) {
    if (perQuery[m.keywordIndex]) {
      perQuery[m.keywordIndex]!.momentumScore = m.momentumScore;
    }
  }

  // Relative dominance ranking — by average interest descending.
  const dominanceRanked = [...perQuery]
    .sort((a, b) => b.averageInterest - a.averageInterest)
    .map((entry, i) => ({
      keyword: entry.keyword,
      rank: i + 1,
      averageInterest: entry.averageInterest,
    }));
  const relativeDominanceRanking: GOOGLE_TRENDS_DOMINANCE_RANKING_ENTRY[] =
    dominanceRanked;

  // Momentum comparison — by momentum score descending (ties broken by slope).
  const momentumRanked = [...perQuery]
    .sort((a, b) => b.momentumScore - a.momentumScore || b.trendSlope - a.trendSlope)
    .map((entry, i) => ({
      keyword: entry.keyword,
      rank: i + 1,
      momentumScore: entry.momentumScore,
      trendSlope: entry.trendSlope,
    }));
  const momentumComparison: GOOGLE_TRENDS_MOMENTUM_RANKING_ENTRY[] =
    momentumRanked;

  // Crossover points — first crossover per (rising, falling) pair.
  const rawCrossovers = detectCrossovers(raw.interestOverTime, keywords);
  const crossoverPoints: GOOGLE_TRENDS_CROSSOVER_POINT[] = rawCrossovers.map(
    (c) => ({
      risingKeywordIndex: c.risingKeywordIndex,
      fallingKeywordIndex: c.fallingKeywordIndex,
      approximateTime: c.approximateTime,
      description: c.description,
    }),
  );

  return {
    ...raw,
    intelligence: {
      perQuery,
      relativeDominanceRanking,
      momentumComparison,
      crossoverPoints,
    },
  };
}
