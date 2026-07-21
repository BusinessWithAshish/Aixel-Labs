import type { z } from "zod";
import type { GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA } from "../../interest/schemas";
import {
  fetchGoogleTrendsInterest,
  fetchGoogleTrendsInterestCore,
} from "../../interest/helpers";
import { GOOGLE_TRENDS_PROPERTY, GOOGLE_TRENDS_TIMEFRAME } from "../../constants";
import {
  buildRisingTop10,
  classifyLifecycleStage,
  classifyTrendDirection,
  computeGeographicConcentration,
  computeLinearSlope,
  computePlatformComparison,
  computeSeriesAverage,
  computeTrendConsistency,
  detectSeasonalPattern,
  extractBreakouts,
  extractSeries,
} from "../compute";
import type { GOOGLE_TRENDS_INTEREST_INTELLIGENCE_RESPONSE } from "../types";

export type GoogleTrendsInterestIntelligenceInput = z.infer<
  typeof GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA
>;

/**
 * Fetches Google Trends interest data for a single keyword and computes the
 * intelligence layer on top: trend direction, lifecycle stage, seasonal
 * pattern, breakouts, platform comparison (web vs YouTube), geographic
 * concentration, and the top-10 rising related queries.
 *
 * Platform comparison requires fetching both web and YouTube interest — when
 * the requested property is web (default) we additionally fetch YouTube in
 * parallel, and vice versa. For other properties (news / images / shopping)
 * platform comparison is `null`.
 */
export async function googleTrendsInterestIntelligenceService(
  input: GoogleTrendsInterestIntelligenceInput,
): Promise<GOOGLE_TRENDS_INTEREST_INTELLIGENCE_RESPONSE> {
  const isShortTimeframe =
    input.timeframe === GOOGLE_TRENDS_TIMEFRAME.LAST_7_DAYS ||
    input.timeframe === GOOGLE_TRENDS_TIMEFRAME.LAST_30_DAYS;

  // Determine the secondary property for platform comparison.
  const secondaryProperty =
    input.property === GOOGLE_TRENDS_PROPERTY.WEB
      ? GOOGLE_TRENDS_PROPERTY.YOUTUBE
      : input.property === GOOGLE_TRENDS_PROPERTY.YOUTUBE
        ? GOOGLE_TRENDS_PROPERTY.WEB
        : null;

  const [main, secondary] = await Promise.all([
    fetchGoogleTrendsInterest(input),
    secondaryProperty
      ? fetchGoogleTrendsInterestCore(
          [
            {
              keyword: input.keyword,
              geo: input.geo,
              time: input.timeframe,
            },
          ],
          input.category,
          secondaryProperty,
          input.hl,
          input.tz,
          input.limit,
        )
      : Promise.resolve(null),
  ]);

  const series = extractSeries(main.interestOverTime, 0);
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

  const seasonalPattern = detectSeasonalPattern(main.interestOverTime, 0);
  const breakouts = extractBreakouts(main.risingRelatedQueries);
  const geographicConcentration = computeGeographicConcentration(
    main.geoDistribution,
    0,
  );
  const risingRelatedQueriesTop10 = buildRisingTop10(main.risingRelatedQueries);

  let platformComparison = null;
  if (secondary) {
    const secondarySeries = extractSeries(secondary.interestOverTime, 0);
    const secondaryAvg = computeSeriesAverage(secondarySeries);
    const mainAvg = averageInterest;
    if (input.property === GOOGLE_TRENDS_PROPERTY.WEB) {
      platformComparison = computePlatformComparison(mainAvg, secondaryAvg);
    } else {
      platformComparison = computePlatformComparison(secondaryAvg, mainAvg);
    }
  }

  return {
    ...main,
    intelligence: {
      trendDirection: direction,
      trendSlope: Math.round(slope * 10000) / 10000,
      trendConsistency: Math.round(consistency * 1000) / 1000,
      lifecycleStage,
      averageInterest: Math.round(averageInterest * 100) / 100,
      seasonalPattern,
      breakouts,
      platformComparison,
      geographicConcentration,
      risingRelatedQueriesTop10,
    },
  };
}
