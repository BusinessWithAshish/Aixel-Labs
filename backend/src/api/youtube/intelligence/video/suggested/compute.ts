import type { YOUTUBE_VIDEO_SUGGESTION_ITEM } from "../../../video/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../../video-meta";
import {
  computeRatio,
  emptyDurationBucketDistribution,
  incrementDurationBucket,
} from "../../helpers";
import {
  computeChannelTier,
  computeDurationBucket,
  computeIsShort,
  computePublishedDaysAgo,
  computeTitleHasNumber,
  computeTitleHasQuestion,
  computeTitleHasYear,
  computeTitleLength,
  computeViewsPerDay,
} from "../compute";
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
  const publishedDaysAgo = computePublishedDaysAgo(
    context.watchMeta.publishedAt,
    context.harvestedAt,
  );

  return {
    suggestionPosition: context.suggestionPosition,
    publishedDaysAgo,
    viewsPerDay: computeViewsPerDay(item.views, publishedDaysAgo),
    durationBucket: computeDurationBucket(item.duration),
    isShort: computeIsShort(item.duration),
    titleLength: computeTitleLength(item.title),
    titleHasNumber: computeTitleHasNumber(item.title),
    titleHasQuestion: computeTitleHasQuestion(item.title),
    titleHasYear: computeTitleHasYear(item.title),
    channelTier: computeChannelTier(context.watchMeta.channelSubscribers),
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
  const sameChannelRatio = computeRatio(
    comparableItems.filter((item) => item.intelligence.isSameChannel).length,
    comparableItems.length,
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

  let dominantChannelId: string | null = null;
  let dominantChannelCount = 0;
  for (const [channelId, count] of channelCounts) {
    if (count > dominantChannelCount) {
      dominantChannelId = channelId;
      dominantChannelCount = count;
    }
  }

  return {
    sameChannelRatio,
    avgSuggestionPosition,
    durationBucketDistribution,
    channelDiversityCount: channelCounts.size,
    dominantChannelId,
    dominantChannelCount,
  };
}
