import type { GOOGLE_TRENDS_INTEREST_POINT } from "../../interest/types";

/** Extracts the interest values for a single query (index 0 by default) from each point. */
export function extractSeries(
  points: GOOGLE_TRENDS_INTEREST_POINT[],
  queryIndex = 0,
): number[] {
  return points.map((p) => p.values[queryIndex] ?? 0);
}

/**
 * Computes the slope of the linear regression line through the series.
 * Returns interest points per step (per timeline bucket).
 */
export function computeLinearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (values[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return 0;
  return num / den;
}

/** Fraction (0–1) of step-to-step deltas that agree in sign with the overall slope. */
export function computeTrendConsistency(values: number[], slope: number): number {
  if (values.length < 2) return 0;
  let agreeing = 0;
  let total = 0;
  for (let i = 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    if (delta === 0) continue;
    total++;
    if (Math.sign(delta) === Math.sign(slope)) agreeing++;
  }
  return total === 0 ? 0 : agreeing / total;
}

/** Average of a numeric series (0 when empty). */
export function computeSeriesAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
