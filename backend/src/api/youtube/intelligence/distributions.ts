import { YOUTUBE_CHANNEL_TIER, YOUTUBE_DURATION_BUCKET } from "../constants";
import {
  YOUTUBE_CHANNEL_TIER_ORDER,
  YOUTUBE_DURATION_BUCKET_ORDER,
} from "./constants";

export function emptyDurationBucketDistribution(): Record<
  YOUTUBE_DURATION_BUCKET,
  number
> {
  return Object.fromEntries(
    YOUTUBE_DURATION_BUCKET_ORDER.map((bucket) => [bucket, 0]),
  ) as Record<YOUTUBE_DURATION_BUCKET, number>;
}

export function emptyChannelTierDistribution(): Record<
  YOUTUBE_CHANNEL_TIER,
  number
> {
  return Object.fromEntries(
    YOUTUBE_CHANNEL_TIER_ORDER.map((tier) => [tier, 0]),
  ) as Record<YOUTUBE_CHANNEL_TIER, number>;
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
