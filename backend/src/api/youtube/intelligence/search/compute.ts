import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../../search/types";
import {
  computeAverage,
  computeMax,
  computePercentiles,
  computeRatio,
  emptyChannelTierDistribution,
  emptyDurationBucketDistribution,
  incrementChannelTier,
  incrementDurationBucket,
} from "../helpers";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import {
  computeChannelTier,
  computeDescriptionLength,
  computeDurationBucket,
  computeIsShort,
  computePublishedDaysAgo,
  computeTitleHasNumber,
  computeTitleHasQuestion,
  computeTitleHasYear,
  computeTitleLength,
  computeTitleWordCount,
  computeVelocityScore,
  computeViewsPerDay,
} from "../video/compute";
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
  const publishedDaysAgo = computePublishedDaysAgo(
    watchMeta.publishedAt,
    harvestedAt,
  );
  const viewsPerDay = computeViewsPerDay(item.viewCount, publishedDaysAgo);
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
    titleLength: computeTitleLength(item.title),
    titleWordCount: computeTitleWordCount(item.title),
    titleHasNumber: computeTitleHasNumber(item.title),
    titleHasQuestion: computeTitleHasQuestion(item.title),
    titleHasYear: computeTitleHasYear(item.title),
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

function isSearchVideoItemIntelligence(
  item:
    | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
    | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
): item is YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE {
  return "videoId" in item;
}

function isSearchChannelItemIntelligence(
  item:
    | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
    | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
): item is YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE {
  return "channelId" in item && !("videoId" in item);
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

  const viewsPerDayValues = videoItems
    .map((item) => item.intelligence.viewsPerDay)
    .filter((value): value is number => value !== null);
  const avgViewsPerDay = computeAverage(viewsPerDayValues);

  const velocityScoreValues = videoItems
    .map((item) => item.intelligence.velocityScore)
    .filter((value): value is number => value !== null);
  const avgVelocityScore = computeAverage(velocityScoreValues);
  const topVelocityScore = computeMax(velocityScoreValues);
  const velocityPercentiles = computePercentiles(velocityScoreValues);
  const velocityDistribution = velocityPercentiles
    ? {
        p25: velocityPercentiles.p25,
        p50: velocityPercentiles.p50,
        p75: velocityPercentiles.p75,
      }
    : null;

  const titleLengths = videoItems
    .map((item) => item.intelligence.titleLength)
    .filter((value): value is number => value !== null);
  const avgTitleLength = computeAverage(titleLengths);

  const shortCount = videoItems.filter(
    (item) => item.intelligence.isShort === true,
  ).length;
  const shortRatio =
    videoItems.length > 0 ? computeRatio(shortCount, videoItems.length) : null;

  const titleWithNumberRatio = computeRatio(
    videoItems.filter((item) => item.intelligence.titleHasNumber).length,
    videoItems.length,
  );
  const titleWithQuestionRatio = computeRatio(
    videoItems.filter((item) => item.intelligence.titleHasQuestion).length,
    videoItems.length,
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
