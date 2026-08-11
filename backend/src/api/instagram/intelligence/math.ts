import { max, mean, min, standardDeviation } from "simple-statistics";
import { INSTAGRAM_PERCENTILE_LEVELS } from "./constants";
import type { INSTAGRAM_INTELLIGENCE_PERCENTILES } from "./types";

export function computeAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return mean(values);
}

export function computeMax(values: number[]): number | null {
  if (values.length === 0) return null;
  return max(values);
}

export function computeMin(values: number[]): number | null {
  if (values.length === 0) return null;
  return min(values);
}

export function computeStandardDeviation(values: number[]): number | null {
  if (values.length < 2) return null;
  return standardDeviation(values);
}

export function computeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

export function safeDivide(
  numerator: number,
  denominator: number,
  minDenominator = 1,
): number {
  return numerator / Math.max(denominator, minDenominator);
}

export function percentile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

export function computePercentiles(
  values: number[],
): INSTAGRAM_INTELLIGENCE_PERCENTILES | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, INSTAGRAM_PERCENTILE_LEVELS.P25),
    p50: percentile(sorted, INSTAGRAM_PERCENTILE_LEVELS.P50),
    p75: percentile(sorted, INSTAGRAM_PERCENTILE_LEVELS.P75),
  };
}

export function extractNonNullValues<T>(
  values: Array<T | null | undefined>,
): T[] {
  return values.filter((value): value is T => value != null);
}
