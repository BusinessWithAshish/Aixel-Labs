import { YOUTUBE_CHANNEL_TIER, YOUTUBE_DURATION_BUCKET } from "../constants";

export function emptyDurationBucketDistribution(): Record<
  YOUTUBE_DURATION_BUCKET,
  number
> {
  return {
    [YOUTUBE_DURATION_BUCKET.SHORTS]: 0,
    [YOUTUBE_DURATION_BUCKET.SHORT]: 0,
    [YOUTUBE_DURATION_BUCKET.MID]: 0,
    [YOUTUBE_DURATION_BUCKET.LONG]: 0,
  };
}

export function emptyChannelTierDistribution(): Record<
  YOUTUBE_CHANNEL_TIER,
  number
> {
  return {
    [YOUTUBE_CHANNEL_TIER.MICRO]: 0,
    [YOUTUBE_CHANNEL_TIER.SMALL]: 0,
    [YOUTUBE_CHANNEL_TIER.MID]: 0,
    [YOUTUBE_CHANNEL_TIER.LARGE]: 0,
  };
}

export function incrementDurationBucket(
  distribution: Record<YOUTUBE_DURATION_BUCKET, number>,
  bucket: YOUTUBE_DURATION_BUCKET | null,
): void {
  if (bucket === null) return;
  distribution[bucket] += 1;
}

export function incrementChannelTier(
  distribution: Record<YOUTUBE_CHANNEL_TIER, number>,
  tier: YOUTUBE_CHANNEL_TIER | null,
): void {
  if (tier === null) return;
  distribution[tier] += 1;
}

export function computeAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function computeMax(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.max(...values);
}

export function computeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function percentile(sorted: number[], p: number): number {
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

export function computePercentiles(values: number[]): {
  p25: number;
  p50: number;
  p75: number;
} | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
  };
}
