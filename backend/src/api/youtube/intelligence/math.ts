import { mean, max, min } from "simple-statistics";
import { YOUTUBE_PERCENTILE_LEVELS } from "./constants";
import type { YOUTUBE_INTELLIGENCE_PERCENTILES } from "./types";

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
): YOUTUBE_INTELLIGENCE_PERCENTILES | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P25),
    p50: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P50),
    p75: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P75),
  };
}

export function extractNonNullValues<T>(
  values: Array<T | null | undefined>,
): T[] {
  return values.filter((value): value is T => value != null);
}

export function extractIntelligenceValues<TItem, TValue>(
  items: TItem[],
  selector: (item: TItem) => TValue | null,
): NonNullable<TValue>[] {
  return items
    .map(selector)
    .filter((value): value is NonNullable<TValue> => value !== null);
}

export function computeTruthyRatio<T>(
  items: T[],
  predicate: (item: T) => boolean,
): number {
  return computeRatio(items.filter(predicate).length, items.length);
}

export function findDominantMapEntry(counts: Map<string, number>): {
  key: string | null;
  count: number;
} {
  let dominantKey: string | null = null;
  let dominantCount = 0;

  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominantKey = key;
      dominantCount = count;
    }
  }

  return { key: dominantKey, count: dominantCount };
}

export function findDominantRecordEntry<T extends string>(
  counts: Record<T, number>,
): { key: T | null; count: number } {
  let dominantKey: T | null = null;
  let dominantCount = 0;

  for (const [key, count] of Object.entries(counts) as Array<[T, number]>) {
    if (count > dominantCount) {
      dominantKey = key;
      dominantCount = count;
    }
  }

  return { key: dominantKey, count: dominantCount };
}
