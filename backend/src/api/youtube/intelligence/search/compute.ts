import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../../search/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import {
  computeChannelTier,
  computeDescriptionLength,
  computeDurationBucket,
  computeIsShort,
  computePublishingVelocityFields,
  computeTitleTextFields,
  computeVelocityScore,
} from "../compute";
import {
  computeAverage,
  computeMax,
  computePercentiles,
  computeRatio,
  computeTruthyRatio,
  extractIntelligenceValues,
} from "../math";
import {
  emptyChannelTierDistribution,
  emptyDurationBucketDistribution,
  incrementChannelTier,
  incrementDurationBucket,
} from "../distributions";
import {
  isSearchChannelItemIntelligence,
  isSearchVideoItemIntelligence,
} from "../type-guards";
import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
  YOUTUBE_SEARCH_INTELLIGENCE_FIELDS,
  YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE,
} from "./types";

export function enrichSearchVideoItemFields(
  item: YOUTUBE_SEARCH_VIDEO_ITEM,
  watchMeta: YOUTUBE_VIDEO_WATCH_META,
  harvestedAt: Date = new Date(),
) {
  const { publishedDaysAgo, viewsPerDay } = computePublishingVelocityFields(
    watchMeta.publishedAt,
    item.viewCount,
    harvestedAt,
  );
  const channelSubscribers = watchMeta.channelSubscribers;

  return {
    publishedDaysAgo,
    viewsPerDay,
    velocityScore: computeVelocityScore(
      item.viewCount,
      publishedDaysAgo,
      channelSubscribers,
    ),
    channelTier: computeChannelTier(channelSubscribers),
    durationBucket: computeDurationBucket(item.duration),
    isShort: computeIsShort(item.duration),
    ...computeTitleTextFields(item.title),
    descriptionLength: computeDescriptionLength(item.description),
  };
}

export function enrichSearchChannelItemFields(
  item: YOUTUBE_SEARCH_CHANNEL_ITEM,
) {
  return {
    channelTier: computeChannelTier(item.subscribers),
  };
}

export function computeSearchAggregateIntelligence(
  items: Array<
    | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
    | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE
  >,
  estimatedResults: number | null,
): YOUTUBE_SEARCH_INTELLIGENCE_FIELDS {
  const videoItems = items.filter(isSearchVideoItemIntelligence);
  const channelItems = items.filter(isSearchChannelItemIntelligence);

  const viewsPerDayValues = extractIntelligenceValues(
    videoItems,
    (item) => item.intelligence.viewsPerDay,
  );
  const avgViewsPerDay = computeAverage(viewsPerDayValues);

  const velocityScoreValues = extractIntelligenceValues(
    videoItems,
    (item) => item.intelligence.velocityScore,
  );
  const avgVelocityScore = computeAverage(velocityScoreValues);
  const topVelocityScore = computeMax(velocityScoreValues);
  const velocityDistribution = computePercentiles(velocityScoreValues);

  const titleLengths = extractIntelligenceValues(
    videoItems,
    (item) => item.intelligence.titleLength,
  );
  const avgTitleLength = computeAverage(titleLengths);

  const shortRatio =
    videoItems.length > 0
      ? computeRatio(
          videoItems.filter((item) => item.intelligence.isShort === true)
            .length,
          videoItems.length,
        )
      : null;

  const titleWithNumberRatio = computeTruthyRatio(
    videoItems,
    (item) => item.intelligence.titleHasNumber,
  );
  const titleWithQuestionRatio = computeTruthyRatio(
    videoItems,
    (item) => item.intelligence.titleHasQuestion,
  );

  const durationBucketDistribution = emptyDurationBucketDistribution();
  for (const item of videoItems) {
    incrementDurationBucket(
      durationBucketDistribution,
      item.intelligence.durationBucket,
    );
  }

  const channelTierDistribution = emptyChannelTierDistribution();
  for (const item of videoItems) {
    incrementChannelTier(
      channelTierDistribution,
      item.intelligence.channelTier,
    );
  }
  for (const item of channelItems) {
    incrementChannelTier(
      channelTierDistribution,
      item.intelligence.channelTier,
    );
  }

  const estimatedSaturation =
    estimatedResults !== null && avgViewsPerDay !== null && avgViewsPerDay > 0
      ? estimatedResults / avgViewsPerDay
      : null;

  return {
    avgViewsPerDay,
    avgTitleLength,
    shortRatio,
    titleWithNumberRatio,
    titleWithQuestionRatio,
    durationBucketDistribution,
    channelTierDistribution,
    estimatedSaturation,
    avgVelocityScore,
    topVelocityScore,
    velocityDistribution,
  };
}
