import type { YOUTUBE_VIDEO_SUGGESTION_ITEM } from "../../../video/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../../video-meta";
import {
  computeChannelTier,
  computeDescriptionLength,
  computeDurationBucket,
  computeIsShort,
  computePublishingVelocityFields,
  computeTitleTextFields,
  computeVelocityScore,
} from "../../compute";
import { computeTruthyRatio, findDominantMapEntry } from "../../math";
import {
  emptyDurationBucketDistribution,
  incrementDurationBucket,
} from "../../distributions";
import type {
  YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_FIELDS,
  YOUTUBE_VIDEO_SUGGESTION_ITEM_INTELLIGENCE,
} from "./types";

export function computeIsSameChannel(
  suggestionChannelId: string | null,
  sourceChannelId: string | null,
): boolean | null {
  if (!suggestionChannelId || !sourceChannelId) return null;
  return suggestionChannelId === sourceChannelId;
}

export function enrichSuggestionItemFields(
  item: YOUTUBE_VIDEO_SUGGESTION_ITEM,
  context: {
    sourceChannelId: string | null;
    suggestionPosition: number;
    watchMeta: YOUTUBE_VIDEO_WATCH_META;
    harvestedAt: Date;
  },
) {
  const { publishedDaysAgo, viewsPerDay } = computePublishingVelocityFields(
    context.watchMeta.publishedAt,
    item.views,
    context.harvestedAt,
  );
  const channelSubscribers = context.watchMeta.channelSubscribers;

  return {
    suggestionPosition: context.suggestionPosition,
    publishedDaysAgo,
    viewsPerDay,
    velocityScore: computeVelocityScore(
      item.views,
      publishedDaysAgo,
      channelSubscribers,
    ),
    durationBucket: computeDurationBucket(item.duration),
    isShort: computeIsShort(item.duration),
    ...computeTitleTextFields(item.title),
    descriptionLength: computeDescriptionLength(context.watchMeta.description),
    channelTier: computeChannelTier(channelSubscribers),
    isSameChannel: computeIsSameChannel(
      item.channelId,
      context.sourceChannelId,
    ),
  };
}

export function computeSuggestedAggregateIntelligence(
  items: YOUTUBE_VIDEO_SUGGESTION_ITEM_INTELLIGENCE[],
): YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_FIELDS {
  const comparableItems = items.filter(
    (item) => item.intelligence.isSameChannel !== null,
  );
  const sameChannelRatio = computeTruthyRatio(
    comparableItems,
    (item) => item.intelligence.isSameChannel === true,
  );

  const avgSuggestionPosition =
    items.length > 0
      ? items.reduce(
          (sum, item) => sum + item.intelligence.suggestionPosition,
          0,
        ) / items.length
      : 0;

  const durationBucketDistribution = emptyDurationBucketDistribution();
  for (const item of items) {
    incrementDurationBucket(
      durationBucketDistribution,
      item.intelligence.durationBucket,
    );
  }

  const channelCounts = new Map<string, number>();
  for (const item of items) {
    if (!item.channelId) continue;
    channelCounts.set(
      item.channelId,
      (channelCounts.get(item.channelId) ?? 0) + 1,
    );
  }

  const { key: dominantChannelId, count: dominantChannelCount } =
    findDominantMapEntry(channelCounts);

  return {
    sameChannelRatio,
    avgSuggestionPosition,
    durationBucketDistribution,
    channelDiversityCount: channelCounts.size,
    dominantChannelId,
    dominantChannelCount,
  };
}
