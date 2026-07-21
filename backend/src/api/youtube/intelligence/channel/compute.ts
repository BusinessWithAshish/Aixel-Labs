import type {
  YOUTUBE_CHANNEL_INFO,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../../channel/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import {
  computeChannelAgeInDays,
  computeChannelTier,
  computeDescriptionLength,
  computeDurationBucket,
  computeEngagementRatio,
  computeIsKidsChannel,
  computeIsShort,
  computeKeywordCount,
  computeAvgViewsPerVideo,
  computePublishingVelocityFields,
  computeRankByViews,
  computeTitleTextFields,
  computeUploadsPerWeek,
  computeVelocityScore,
  computeViewsPerSubscriber,
  computeViewsVsChannelAvg,
} from "../compute";
import { computeAverage } from "../math";
import { computeChannelContentMetrics } from "./content-metrics";
import type { ChannelIntelligenceContext } from "./content-metrics";

export type { ChannelIntelligenceContext } from "./content-metrics";
export {
  computeChannelContentMetrics,
  computeVelocityDistribution,
} from "./content-metrics";

export function enrichChannelInfoFields(
  channelInfo: YOUTUBE_CHANNEL_INFO | null,
  context: ChannelIntelligenceContext,
) {
  const contentMetrics = computeChannelContentMetrics(context);

  if (!channelInfo) {
    return {
      channelAgeInDays: null,
      avgViewsPerVideo: null,
      uploadsPerWeek: null,
      subscriberEfficiencyRatio: null,
      channelTier: null,
      viewsPerSubscriber: null,
      isKidsChannel: null,
      keywordCount: 0,
      ...contentMetrics,
    };
  }

  const channelAgeInDays = computeChannelAgeInDays(
    channelInfo.joinedDateText,
    context.harvestedAt,
  );
  const viewsPerSubscriber = computeViewsPerSubscriber(
    channelInfo.totalViews,
    channelInfo.subscribers,
  );

  return {
    channelAgeInDays,
    avgViewsPerVideo: computeAvgViewsPerVideo(
      channelInfo.totalViews,
      channelInfo.videoCount,
    ),
    uploadsPerWeek: computeUploadsPerWeek(
      channelInfo.videoCount,
      channelAgeInDays,
    ),
    subscriberEfficiencyRatio: viewsPerSubscriber,
    channelTier: computeChannelTier(channelInfo.subscribers),
    viewsPerSubscriber,
    isKidsChannel: computeIsKidsChannel(channelInfo.isFamilySafe),
    keywordCount: computeKeywordCount(channelInfo.keywords),
    ...contentMetrics,
  };
}

export function computeChannelAvgViews(
  items: Array<{ views: number | null }>,
): number | null {
  return computeAverage(
    items
      .map((item) => item.views)
      .filter((views): views is number => views !== null),
  );
}

export function enrichChannelVideoItemFields(
  item: YOUTUBE_CHANNEL_VIDEO_ITEM,
  context: {
    videoItems: YOUTUBE_CHANNEL_VIDEO_ITEM[];
    channelAvgViews: number | null;
    watchMeta: YOUTUBE_VIDEO_WATCH_META;
    channelSubscribers: number | null;
    harvestedAt: Date;
  },
) {
  const duration = context.watchMeta.lengthSeconds;
  const { publishedDaysAgo, viewsPerDay } = computePublishingVelocityFields(
    context.watchMeta.publishedAt,
    item.views,
    context.harvestedAt,
  );
  // Prefer the per-video subscriber count from get_watch; fall back to the
  // channel-level subscriber count (all videos on this channel share it).
  const channelSubscribers =
    context.watchMeta.channelSubscribers ?? context.channelSubscribers;

  return {
    ...computeTitleTextFields(item.title),
    publishedDaysAgo,
    viewsPerDay,
    velocityScore: computeVelocityScore(
      item.views,
      publishedDaysAgo,
      channelSubscribers,
    ),
    durationBucket: computeDurationBucket(duration),
    isShort: computeIsShort(duration),
    descriptionLength: computeDescriptionLength(context.watchMeta.description),
    engagementRatio: computeEngagementRatio(
      context.watchMeta.likeCount,
      context.watchMeta.commentCount,
      item.views,
    ),
    rankOnChannel: computeRankByViews(
      item.videoId,
      context.videoItems.map((video) => ({
        itemId: video.videoId,
        views: video.views,
      })),
    ),
    viewsVsChannelAvg: computeViewsVsChannelAvg(
      item.views,
      context.channelAvgViews,
    ),
  };
}

export function enrichChannelShortItemFields(
  item: YOUTUBE_CHANNEL_SHORT_ITEM,
  context: {
    shortItems: YOUTUBE_CHANNEL_SHORT_ITEM[];
    channelAvgViews: number | null;
    watchMeta: YOUTUBE_VIDEO_WATCH_META;
    harvestedAt: Date;
  },
) {
  const duration = context.watchMeta.lengthSeconds;

  return {
    ...computePublishingVelocityFields(
      context.watchMeta.publishedAt,
      item.views,
      context.harvestedAt,
    ),
    durationBucket: computeDurationBucket(duration),
    isShort: computeIsShort(duration),
    ...computeTitleTextFields(item.title),
    descriptionLength: computeDescriptionLength(context.watchMeta.description),
    rankOnChannel: computeRankByViews(
      item.shortId,
      context.shortItems.map((short) => ({
        itemId: short.shortId,
        views: short.views,
      })),
    ),
    viewsVsChannelAvg: computeViewsVsChannelAvg(
      item.views,
      context.channelAvgViews,
    ),
  };
}
