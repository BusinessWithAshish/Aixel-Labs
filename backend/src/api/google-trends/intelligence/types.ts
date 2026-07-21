import type { WithIntelligence } from "../../youtube/intelligence/types";
import type { GOOGLE_TRENDS_INTEREST_RESPONSE } from "../interest/types";
import type {
  GOOGLE_TRENDS_LIFECYCLE_STAGE,
  GOOGLE_TRENDS_TREND_DIRECTION,
} from "./constants";

// ─── Shared intelligence field types ───────────────────────────────────────────

export type GOOGLE_TRENDS_TREND_DIRECTION_VALUE =
  (typeof GOOGLE_TRENDS_TREND_DIRECTION)[keyof typeof GOOGLE_TRENDS_TREND_DIRECTION];

export type GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE =
  (typeof GOOGLE_TRENDS_LIFECYCLE_STAGE)[keyof typeof GOOGLE_TRENDS_LIFECYCLE_STAGE];

/** Seasonal pattern detected over a 12-month+ timeframe. */
export type GOOGLE_TRENDS_SEASONAL_PATTERN = {
  /** 1-indexed month number (1–12) with the highest average interest. */
  peakMonth: number;
  /** 1-indexed month number (1–12) with the lowest average interest. */
  troughMonth: number;
  /** `peakAvg / troughAvg` — ratio between peak and trough interest. */
  peakToTroughRatio: number;
  /**
   * 1-indexed month number to publish in — the peak month shifted back by
   * `GOOGLE_TRENDS_SEASONAL_PUBLISH_OFFSET_WEEKS` weeks (wrapping around Dec→Jan).
   */
  optimalPublishMonth: number;
  /** Human-readable description of the optimal publish window. */
  optimalPublishWindow: string;
};

/** Breakout rising queries surfaced separately as the earliest acceleration signals. */
export type GOOGLE_TRENDS_BREAKOUT = {
  query: string;
  formattedValue: string | null;
};

/** Platform comparison (web vs YouTube) demand-gap analysis. */
export type GOOGLE_TRENDS_PLATFORM_COMPARISON = {
  /** Average web-search interest (0–100) for the query. */
  webInterest: number;
  /** Average YouTube-search interest (0–100) for the query. */
  youtubeInterest: number;
  /**
   * `webInterest - youtubeInterest`. Positive values indicate people search
   * the topic on Google but YouTube has little content — a content opportunity.
   */
  demandGapScore: number;
  /** `true` when the gap is large enough to flag as a content opportunity. */
  isContentOpportunity: boolean;
};

/** Geographic concentration analysis. */
export type GOOGLE_TRENDS_GEOGRAPHIC_CONCENTRATION = {
  /** `true` when the top 1–2 regions account for > 60% of total interest. */
  isConcentrated: boolean;
  /** Names of the top regions (when concentrated, these are the dominant ones). */
  topRegions: string[];
  /** Share (0–1) of total interest the top regions account for. */
  topRegionsShare: number;
};

/** Top rising related query with parsed growth (top 10, breakouts first). */
export type GOOGLE_TRENDS_RISING_QUERY = {
  query: string;
  /** Parsed growth percentage (e.g. 5000 for "+5,000%"). `null` for breakouts. */
  growth: number | null;
  isBreakout: boolean;
  formattedValue: string | null;
};

// ─── Single-query intelligence ────────────────────────────────────────────────

export type GOOGLE_TRENDS_INTEREST_INTELLIGENCE_FIELDS = {
  trendDirection: GOOGLE_TRENDS_TREND_DIRECTION_VALUE;
  /** Raw slope (interest points per step) of the linear regression over the timeline. */
  trendSlope: number;
  /** Fraction of step-to-step deltas that agree in sign with the overall slope. */
  trendConsistency: number;
  lifecycleStage: GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE;
  /** Average interest (0–100) across the timeline. */
  averageInterest: number;
  seasonalPattern: GOOGLE_TRENDS_SEASONAL_PATTERN | null;
  breakouts: GOOGLE_TRENDS_BREAKOUT[];
  platformComparison: GOOGLE_TRENDS_PLATFORM_COMPARISON | null;
  geographicConcentration: GOOGLE_TRENDS_GEOGRAPHIC_CONCENTRATION | null;
  risingRelatedQueriesTop10: GOOGLE_TRENDS_RISING_QUERY[];
};

export type GOOGLE_TRENDS_INTEREST_INTELLIGENCE_RESPONSE = WithIntelligence<
  GOOGLE_TRENDS_INTEREST_RESPONSE,
  GOOGLE_TRENDS_INTEREST_INTELLIGENCE_FIELDS
>;

// ─── Multi-query comparison intelligence ──────────────────────────────────────

export type GOOGLE_TRENDS_COMPARED_QUERY = {
  keyword: string;
  trendDirection: GOOGLE_TRENDS_TREND_DIRECTION_VALUE;
  trendSlope: number;
  trendConsistency: number;
  lifecycleStage: GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE;
  /** Average interest (0–100) across the timeline for this query. */
  averageInterest: number;
  /**
   * Momentum score — the recent slope (last 20% of the timeline) normalised
   * to a 0–100 scale across the comparison set. Higher = stronger recent
   * positive momentum.
   */
  momentumScore: number;
};

export type GOOGLE_TRENDS_DOMINANCE_RANKING_ENTRY = {
  keyword: string;
  rank: number;
  averageInterest: number;
};

export type GOOGLE_TRENDS_MOMENTUM_RANKING_ENTRY = {
  keyword: string;
  rank: number;
  momentumScore: number;
  trendSlope: number;
};

export type GOOGLE_TRENDS_CROSSOVER_POINT = {
  /** Index of the query whose line was below and crossed above. */
  risingKeywordIndex: number;
  /** Index of the query whose line was above and crossed below. */
  fallingKeywordIndex: number;
  /** Unix timestamp (seconds) of the approximate crossover point. */
  approximateTime: number;
  /** Human-readable description. */
  description: string;
};

export type GOOGLE_TRENDS_COMPARE_INTELLIGENCE_FIELDS = {
  perQuery: GOOGLE_TRENDS_COMPARED_QUERY[];
  /** Ranked by average interest descending (rank 1 = highest average). */
  relativeDominanceRanking: GOOGLE_TRENDS_DOMINANCE_RANKING_ENTRY[];
  /** Ranked by recent momentum descending (rank 1 = strongest positive momentum). */
  momentumComparison: GOOGLE_TRENDS_MOMENTUM_RANKING_ENTRY[];
  crossoverPoints: GOOGLE_TRENDS_CROSSOVER_POINT[];
};

export type GOOGLE_TRENDS_COMPARE_INTELLIGENCE_RESPONSE = WithIntelligence<
  GOOGLE_TRENDS_INTEREST_RESPONSE,
  GOOGLE_TRENDS_COMPARE_INTELLIGENCE_FIELDS
>;
