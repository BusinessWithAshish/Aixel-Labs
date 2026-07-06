import type {
  YOUTUBE_CHANNEL_INFO,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../../channel/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import { computeAverage, computePercentiles, computeRatio } from "../helpers";
import {
  computeChannelTier,
  computeDurationBucket,
  computeEngagementRatio,
  computeIsShort,
  computePublishedDaysAgo,
  computeTitleHasNumber,
  computeTitleHasQuestion,
  computeTitleHasYear,
  computeTitleLength,
  computeViewsPerDay,
} from "../video/compute";
import type { YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS } from "./types";

const MS_PER_DAY = 86_400_000;
const RECENT_VELOCITY_ACCELERATING_RATIO = 1.1;
const RECENT_VELOCITY_DECELERATING_RATIO = 0.9;

function parseJoinedDate(joinedDateText: string | null): Date | null {
  if (!joinedDateText?.trim()) return null;

  const stripped = joinedDateText.replace(/^Joined\s+/i, "").trim();
  const parsed = new Date(stripped);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseChannelKeywords(keywords: string | null): string[] {
  if (!keywords?.trim()) return [];

  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;

  for (const match of keywords.matchAll(pattern)) {
    const term = (match[1] ?? match[2])?.trim().toLowerCase();
    if (term) terms.push(term);
  }

  return [...new Set(terms)];
}

export function computeChannelAgeInDays(
  joinedDateText: string | null,
  harvestedAt: Date = new Date(),
): number | null {
  const joined = parseJoinedDate(joinedDateText);
  if (!joined) return null;

  const diffMs = harvestedAt.getTime() - joined.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

export function computeAvgViewsPerVideo(
  totalViews: number | null,
  videoCount: number | null,
): number | null {
  if (totalViews === null || videoCount === null) return null;
  return totalViews / Math.max(videoCount, 1);
}

export function computeUploadsPerWeek(
  videoCount: number | null,
  channelAgeInDays: number | null,
): number | null {
  if (videoCount === null || channelAgeInDays === null || channelAgeInDays === 0) {
    return null;
  }

  return videoCount / (channelAgeInDays / 7);
}

export function computeViewsPerSubscriber(
  totalViews: number | null,
  subscribers: number | null,
): number | null {
  if (totalViews === null || subscribers === null) return null;
  return totalViews / Math.max(subscribers, 1);
}

export function computeIsKidsChannel(isFamilySafe: boolean | null): boolean | null {
  if (isFamilySafe === null) return null;
  return isFamilySafe;
}

export function computeKeywordCount(keywords: string | null): number {
  return parseChannelKeywords(keywords).length;
}

type ChannelVelocityItem = {
  videoId: string;
  views: number | null;
};

export type ChannelIntelligenceContext = {
  videosTab: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  shortsTab: YOUTUBE_CHANNEL_SHORT_ITEM[];
  watchMetaByVideoId: Map<string, YOUTUBE_VIDEO_WATCH_META>;
  harvestedAt: Date;
};

function collectVelocityItems(
  context: ChannelIntelligenceContext,
): ChannelVelocityItem[] {
  return [
    ...context.videosTab.map((item) => ({
      videoId: item.videoId,
      views: item.views,
    })),
    ...context.shortsTab.map((item) => ({
      videoId: item.shortId,
      views: item.views,
    })),
  ];
}

export function computeVelocityDistribution(
  items: ChannelVelocityItem[],
  watchMetaByVideoId: Map<string, YOUTUBE_VIDEO_WATCH_META>,
  harvestedAt: Date = new Date(),
): YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS["velocityDistribution"] {
  const viewsPerDayValues: number[] = [];

  for (const item of items) {
    const watchMeta = watchMetaByVideoId.get(item.videoId);
    const publishedAt = watchMeta?.publishedAt ?? null;
    const publishedDaysAgo = computePublishedDaysAgo(publishedAt, harvestedAt);
    const viewsPerDay = computeViewsPerDay(item.views, publishedDaysAgo);
    if (viewsPerDay !== null) {
      viewsPerDayValues.push(viewsPerDay);
    }
  }

  const percentiles = computePercentiles(viewsPerDayValues);
  if (!percentiles) return null;

  return {
    p25: percentiles.p25,
    p50: percentiles.p50,
    p75: percentiles.p75,
  };
}

function computeRecentUploadMetrics(
  context: ChannelIntelligenceContext,
): Pick<
  YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS,
  "uploadsLast30Days" | "uploadsLast90Days" | "recentVelocityTrend"
> {
  const { videosTab, watchMetaByVideoId, harvestedAt } = context;

  if (videosTab.length === 0) {
    return {
      uploadsLast30Days: null,
      uploadsLast90Days: null,
      recentVelocityTrend: null,
    };
  }

  let uploadsLast30Days = 0;
  let uploadsLast90Days = 0;
  let resolvedPublishDates = 0;
  const last30ViewsPerDay: number[] = [];
  const days31to90ViewsPerDay: number[] = [];

  for (const item of videosTab) {
    const publishedAt = watchMetaByVideoId.get(item.videoId)?.publishedAt ?? null;
    const publishedDaysAgo = computePublishedDaysAgo(publishedAt, harvestedAt);
    if (publishedDaysAgo === null) continue;

    resolvedPublishDates += 1;

    if (publishedDaysAgo <= 30) uploadsLast30Days += 1;
    if (publishedDaysAgo <= 90) uploadsLast90Days += 1;

    const viewsPerDay = computeViewsPerDay(item.views, publishedDaysAgo);
    if (viewsPerDay === null) continue;

    if (publishedDaysAgo <= 30) {
      last30ViewsPerDay.push(viewsPerDay);
    } else if (publishedDaysAgo <= 90) {
      days31to90ViewsPerDay.push(viewsPerDay);
    }
  }

  if (resolvedPublishDates === 0) {
    return {
      uploadsLast30Days: null,
      uploadsLast90Days: null,
      recentVelocityTrend: null,
    };
  }

  const recentAvg = computeAverage(last30ViewsPerDay);
  const olderAvg = computeAverage(days31to90ViewsPerDay);

  let recentVelocityTrend: YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS["recentVelocityTrend"] =
    null;

  if (recentAvg !== null && olderAvg !== null) {
    if (olderAvg === 0) {
      recentVelocityTrend = recentAvg > 0 ? "accelerating" : "stable";
    } else {
      const ratio = recentAvg / olderAvg;
      if (ratio > RECENT_VELOCITY_ACCELERATING_RATIO) {
        recentVelocityTrend = "accelerating";
      } else if (ratio < RECENT_VELOCITY_DECELERATING_RATIO) {
        recentVelocityTrend = "decelerating";
      } else {
        recentVelocityTrend = "stable";
      }
    }
  }

  return {
    uploadsLast30Days,
    uploadsLast90Days,
    recentVelocityTrend,
  };
}

export function computeChannelContentMetrics(
  context: ChannelIntelligenceContext,
): Pick<
  YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS,
  | "shortCount"
  | "videoOnlyCount"
  | "shortRatio"
  | "avgVideoDuration"
  | "topVideoViewCount"
  | "bottomVideoViewCount"
  | "velocityDistribution"
  | "uploadsLast30Days"
  | "uploadsLast90Days"
  | "recentVelocityTrend"
> {
  const shortCount = context.shortsTab.length;
  const videoOnlyCount = context.videosTab.length;
  const catalogSampleTotal = shortCount + videoOnlyCount;
  const shortRatio =
    catalogSampleTotal > 0
      ? computeRatio(shortCount, catalogSampleTotal)
      : null;

  const viewCounts = context.videosTab
    .map((item) => item.views)
    .filter((views): views is number => views !== null);

  const durationValues = context.videosTab
    .map(
      (item) => context.watchMetaByVideoId.get(item.videoId)?.lengthSeconds ?? null,
    )
    .filter((duration): duration is number => duration !== null);

  const recentUploadMetrics = computeRecentUploadMetrics(context);

  return {
    shortCount,
    videoOnlyCount,
    shortRatio,
    avgVideoDuration: computeAverage(durationValues),
    topVideoViewCount:
      viewCounts.length > 0 ? Math.max(...viewCounts) : null,
    bottomVideoViewCount:
      viewCounts.length > 0 ? Math.min(...viewCounts) : null,
    velocityDistribution: computeVelocityDistribution(
      collectVelocityItems(context),
      context.watchMetaByVideoId,
      context.harvestedAt,
    ),
    ...recentUploadMetrics,
  };
}

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
  const viewCounts = items
    .map((item) => item.views)
    .filter((views): views is number => views !== null);

  if (viewCounts.length === 0) return null;

  return viewCounts.reduce((sum, views) => sum + views, 0) / viewCounts.length;
}

export function computeRankOnChannel(
  itemId: string,
  items: Array<{ itemId: string; views: number | null }>,
): number | null {
  const ranked = [...items]
    .filter((item) => item.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0));

  const index = ranked.findIndex((item) => item.itemId === itemId);
  return index === -1 ? null : index + 1;
}

export function computeViewsVsChannelAvg(
  views: number | null,
  channelAvgViews: number | null,
): number | null {
  if (views === null || channelAvgViews === null || channelAvgViews === 0) {
    return null;
  }

  return views / channelAvgViews;
}

export function enrichChannelVideoItemFields(
  item: YOUTUBE_CHANNEL_VIDEO_ITEM,
  context: {
    videoItems: YOUTUBE_CHANNEL_VIDEO_ITEM[];
    channelAvgViews: number | null;
    watchMeta: YOUTUBE_VIDEO_WATCH_META;
    harvestedAt: Date;
  },
) {
  const publishedDaysAgo = computePublishedDaysAgo(
    context.watchMeta.publishedAt,
    context.harvestedAt,
  );
  const duration = context.watchMeta.lengthSeconds;

  return {
    titleLength: computeTitleLength(item.title),
    titleHasNumber: computeTitleHasNumber(item.title),
    titleHasQuestion: computeTitleHasQuestion(item.title),
    titleHasYear: computeTitleHasYear(item.title),
    publishedDaysAgo,
    viewsPerDay: computeViewsPerDay(item.views, publishedDaysAgo),
    durationBucket: computeDurationBucket(duration),
    isShort: computeIsShort(duration),
    engagementRatio: computeEngagementRatio(
      context.watchMeta.likeCount,
      context.watchMeta.commentCount,
      item.views,
    ),
    rankOnChannel: computeRankOnChannel(
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
  const publishedDaysAgo = computePublishedDaysAgo(
    context.watchMeta.publishedAt,
    context.harvestedAt,
  );

  return {
    publishedDaysAgo,
    viewsPerDay: computeViewsPerDay(item.views, publishedDaysAgo),
    isShort: true as const,
    titleLength: computeTitleLength(item.title),
    titleHasNumber: computeTitleHasNumber(item.title),
    rankOnChannel: computeRankOnChannel(
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
