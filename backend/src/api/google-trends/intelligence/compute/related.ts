import { GOOGLE_TRENDS_RISING_TOP_N } from "../constants";
import type { GOOGLE_TRENDS_RELATED_QUERY } from "../../interest/types";
import type { GOOGLE_TRENDS_RISING_QUERY } from "../types";

/** Extracts breakout queries (rising queries flagged as "Breakout" by Google). */
export function extractBreakouts(
  rising: GOOGLE_TRENDS_RELATED_QUERY[],
): { query: string; formattedValue: string | null }[] {
  return rising
    .filter((q) => q.isBreakout)
    .map((q) => ({ query: q.query, formattedValue: q.formattedValue }));
}

/**
 * Builds the top-N rising queries list, with breakouts ranked first
 * (sorted alphabetically among breakouts), then non-breakout queries sorted
 * by parsed growth percentage descending.
 */
export function buildRisingTop10(
  rising: GOOGLE_TRENDS_RELATED_QUERY[],
): GOOGLE_TRENDS_RISING_QUERY[] {
  const mapped: GOOGLE_TRENDS_RISING_QUERY[] = rising.map((q) => ({
    query: q.query,
    growth: q.growth,
    isBreakout: q.isBreakout,
    formattedValue: q.formattedValue,
  }));

  const breakouts = mapped
    .filter((q) => q.isBreakout)
    .sort((a, b) => a.query.localeCompare(b.query));
  const nonBreakouts = mapped
    .filter((q) => !q.isBreakout)
    .sort((a, b) => (b.growth ?? 0) - (a.growth ?? 0));

  return [...breakouts, ...nonBreakouts].slice(0, GOOGLE_TRENDS_RISING_TOP_N);
}
