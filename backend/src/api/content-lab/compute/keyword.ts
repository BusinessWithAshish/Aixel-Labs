import { CONTENT_LAB_KEYWORD as K } from "../constants";
import type { CONTENT_LAB_KEYWORD_RESPONSE, CONTENT_LAB_KEYWORD_TREND } from "../types";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Weekly 0-100 interest → now / change / direction; null when too few weeks
 * have any searches to say anything (Trends returns all zeros for those).
 */
export function summarizeTrend(weekly: readonly number[], rising: readonly string[]): CONTENT_LAB_KEYWORD_TREND | null {
  if (weekly.filter((v) => v > 0).length < K.minWeeks) return null;
  const recent = weekly.slice(-K.recentWeeks);
  const before = weekly.slice(-(K.recentWeeks + K.previousWeeks), -K.recentWeeks);
  const now = Math.round(mean(recent));
  const base = mean(before);
  const change = base > 0 ? Math.round(((mean(recent) - base) / base) * 100) : 0;
  const direction = change > K.steadyPercent ? "rising" : change < -K.steadyPercent ? "falling" : "steady";
  return { weekly: [...weekly], now, change, direction, rising: rising.slice(0, K.rising) };
}

/** "Lots of people search this on YouTube, and interest is up 23% in the last month." */
function keywordSummary(searchCount: number, trend: CONTENT_LAB_KEYWORD_TREND | null): string {
  const demand =
    searchCount >= K.demandSearches * 0.8
      ? "Lots of people search this on YouTube"
      : searchCount >= 3
        ? "Some people search this on YouTube"
        : "Few people search exactly this on YouTube";
  if (!trend) return `${demand}.`;
  const weeks = `the last ${K.recentWeeks} weeks`;
  if (trend.direction === "rising") return `${demand}, and interest is up ${trend.change}% in ${weeks}.`;
  if (trend.direction === "falling") return `${demand}, but interest is down ${Math.abs(trend.change)}% in ${weeks}.`;
  return `${demand}, and interest is steady.`;
}

/**
 * 0-100 from demand (how many searches YouTube completes it to), how busy it
 * is now against its busiest week, and momentum; demand alone (capped at
 * `demandOnlyMax`) when there is no trend.
 */
export function scoreKeyword(
  searchCount: number,
  trend: CONTENT_LAB_KEYWORD_TREND | null,
): Pick<CONTENT_LAB_KEYWORD_RESPONSE, "score" | "label" | "summary"> {
  const demand = clamp01(searchCount / K.demandSearches);
  const score = trend
    ? Math.round(
        100 *
          (K.weights.demand * demand +
            K.weights.now * clamp01(trend.now / 100) +
            K.weights.momentum * clamp01(0.5 + trend.change / (2 * K.momentumRange))),
      )
    : Math.round(K.demandOnlyMax * demand);
  const label = score >= K.labels.strong ? "strong" : score >= K.labels.okay ? "okay" : "weak";
  return { score, label, summary: keywordSummary(searchCount, trend) };
}
