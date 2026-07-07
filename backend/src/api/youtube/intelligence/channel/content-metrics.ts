import type {
  YOUTUBE_CHANNEL_VIDEO_ITEM,
  YOUTUBE_CHANNEL_SHORT_ITEM,
} from "../../channel/types";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import {
  YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS,
  YOUTUBE_RECENT_VELOCITY_TREND,
  YOUTUBE_RECENT_VELOCITY_TREND_RATIOS,
} from "../constants";
import { computePublishingVelocityFields } from "../compute";
import {
  computeAverage,
  computeMax,
  computeMin,
  computePercentiles,
  computeRatio,
} from "../math";
import type { YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS } from "./types";
import type { YOUTUBE_RECENT_VELOCITY_TREND_VALUE } from "../types";

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
    const publishedAt =
      watchMetaByVideoId.get(item.videoId)?.publishedAt ?? null;
    const { viewsPerDay } = computePublishingVelocityFields(
      publishedAt,
      item.views,
      harvestedAt,
    );
    if (viewsPerDay !== null) {
      viewsPerDayValues.push(viewsPerDay);
    }
  }

  return computePercentiles(viewsPerDayValues);
}

function classifyRecentVelocityTrend(
  recentAvg: number,
  olderAvg: number,
): YOUTUBE_RECENT_VELOCITY_TREND_VALUE {
  if (olderAvg === 0) {
    return recentAvg > 0
      ? YOUTUBE_RECENT_VELOCITY_TREND.ACCELERATING
      : YOUTUBE_RECENT_VELOCITY_TREND.STABLE;
  }

  const ratio = recentAvg / olderAvg;
  if (ratio > YOUTUBE_RECENT_VELOCITY_TREND_RATIOS.ACCELERATING) {
    return YOUTUBE_RECENT_VELOCITY_TREND.ACCELERATING;
  }
  if (ratio < YOUTUBE_RECENT_VELOCITY_TREND_RATIOS.DECELERATING) {
    return YOUTUBE_RECENT_VELOCITY_TREND.DECELERATING;
  }
  return YOUTUBE_RECENT_VELOCITY_TREND.STABLE;
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
    const publishedAt =
      watchMetaByVideoId.get(item.videoId)?.publishedAt ?? null;
    const { publishedDaysAgo, viewsPerDay } = computePublishingVelocityFields(
      publishedAt,
      item.views,
      harvestedAt,
    );
    if (publishedDaysAgo === null) continue;

    resolvedPublishDates += 1;

    if (publishedDaysAgo <= YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS.RECENT) {
      uploadsLast30Days += 1;
    }
    if (publishedDaysAgo <= YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS.EXTENDED) {
      uploadsLast90Days += 1;
    }

    if (viewsPerDay === null) continue;

    if (publishedDaysAgo <= YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS.RECENT) {
      last30ViewsPerDay.push(viewsPerDay);
    } else if (publishedDaysAgo <= YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS.EXTENDED) {
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
    recentVelocityTrend = classifyRecentVelocityTrend(recentAvg, olderAvg);
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
      (item) =>
        context.watchMetaByVideoId.get(item.videoId)?.lengthSeconds ?? null,
    )
    .filter((duration): duration is number => duration !== null);

  const recentUploadMetrics = computeRecentUploadMetrics(context);

  return {
    shortCount,
    videoOnlyCount,
    shortRatio,
    avgVideoDuration: computeAverage(durationValues),
    topVideoViewCount: computeMax(viewCounts),
    bottomVideoViewCount: computeMin(viewCounts),
    velocityDistribution: computeVelocityDistribution(
      collectVelocityItems(context),
      context.watchMetaByVideoId,
      context.harvestedAt,
    ),
    ...recentUploadMetrics,
  };
}
