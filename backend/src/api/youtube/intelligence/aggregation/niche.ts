import type { z } from "zod";
import type { YOUTUBE_DURATION_BUCKET, YOUTUBE_CHANNEL_TIER } from "../../constants";
import {
  emptyChannelTierDistribution,
  emptyDurationBucketDistribution,
  incrementChannelTier,
  incrementDurationBucket,
} from "../distributions";
import {
  computeAverage,
  computeRatio,
  extractIntelligenceValues,
  findDominantRecordEntry,
  percentile,
} from "../math";
import { YOUTUBE_PERCENTILE_LEVELS } from "../constants";
import type { YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE } from "../search/types";
import type { AGGREGATE_NICHE_SIGNALS_SCHEMA } from "./schemas";
import type {
  YOUTUBE_NICHE_LIFECYCLE_STAGE,
  YOUTUBE_NICHE_SIGNALS_RESPONSE,
  YOUTUBE_NICHE_VELOCITY_DISTRIBUTION,
} from "./types";

export type AggregateNicheSignalsInput = z.infer<
  typeof AGGREGATE_NICHE_SIGNALS_SCHEMA
>;

function computeVelocityDistributionWithP90(
  values: number[],
): YOUTUBE_NICHE_VELOCITY_DISTRIBUTION | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P25),
    p50: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P50),
    p75: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P75),
    p90: percentile(sorted, YOUTUBE_PERCENTILE_LEVELS.P90),
  };
}

function classifyLifecycleStage(input: {
  videoCount: number;
  saturationScore: number | null;
  avgVelocityScore: number | null;
  shortRatio: number | null;
}): YOUTUBE_NICHE_LIFECYCLE_STAGE {
  const { videoCount, saturationScore, avgVelocityScore } = input;

  if (videoCount < 10 || (avgVelocityScore !== null && avgVelocityScore > 2)) {
    return "emerging";
  }
  if (saturationScore !== null && saturationScore > 50) {
    return "saturated";
  }
  if (saturationScore !== null && saturationScore > 15) {
    return "mature";
  }
  return "growing";
}

function asVideoItems(items: unknown[]): YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE[] {
  return items.filter(
    (item): item is YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE =>
      typeof item === "object" &&
      item !== null &&
      "videoId" in item &&
      "intelligence" in item,
  );
}

export function aggregateNicheSignalsService(
  input: AggregateNicheSignalsInput,
): YOUTUBE_NICHE_SIGNALS_RESPONSE {
  const videoItems = asVideoItems(input.items);

  const velocityScoreValues = extractIntelligenceValues(
    videoItems,
    (item) => item.intelligence.velocityScore,
  );
  const avgVelocityScore = computeAverage(velocityScoreValues);
  const velocityDistribution =
    computeVelocityDistributionWithP90(velocityScoreValues);

  const viewsPerDayValues = extractIntelligenceValues(
    videoItems,
    (item) => item.intelligence.viewsPerDay,
  );
  const avgViewsPerDay = computeAverage(viewsPerDayValues);

  const durationBucketDistribution = emptyDurationBucketDistribution();
  const channelTierDistribution = emptyChannelTierDistribution();

  for (const item of videoItems) {
    incrementDurationBucket(
      durationBucketDistribution,
      item.intelligence.durationBucket,
    );
    incrementChannelTier(
      channelTierDistribution,
      item.intelligence.channelTier,
    );
  }

  const shortRatio =
    videoItems.length > 0
      ? computeRatio(
          videoItems.filter((item) => item.intelligence.isShort === true)
            .length,
          videoItems.length,
        )
      : null;

  // Without estimatedResults, approximate saturation from sample density vs velocity.
  const saturationScore =
    avgViewsPerDay !== null && avgViewsPerDay > 0
      ? videoItems.length / avgViewsPerDay
      : null;

  const dominantDurationBucket = findDominantRecordEntry(
    durationBucketDistribution,
  ).key as YOUTUBE_DURATION_BUCKET | null;
  const dominantChannelTier = findDominantRecordEntry(
    channelTierDistribution,
  ).key as YOUTUBE_CHANNEL_TIER | null;

  return {
    nicheLabel: input.nicheLabel ?? null,
    videoCount: videoItems.length,
    avgVelocityScore,
    velocityDistribution,
    saturationScore,
    durationBucketDistribution,
    channelTierDistribution,
    shortRatio,
    dominantDurationBucket,
    dominantChannelTier,
    lifecycleStage: classifyLifecycleStage({
      videoCount: videoItems.length,
      saturationScore,
      avgVelocityScore,
      shortRatio,
    }),
  };
}
