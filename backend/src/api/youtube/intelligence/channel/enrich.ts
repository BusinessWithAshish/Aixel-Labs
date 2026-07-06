import type {
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
  YOUTUBE_CHANNEL_RESPONSE,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../../channel/types";
import { YT_CHANNEL_CONTENT_TYPE } from "../../channel/constants";
import { fetchVideoWatchMetaByVideoIds } from "../../video-meta";
import type { YOUTUBE_VIDEO_WATCH_META } from "../../video-meta";
import type { ChannelIntelligenceHarvest } from "./harvest";
import {
  computeChannelAvgViews,
  enrichChannelInfoFields,
  enrichChannelShortItemFields,
  enrichChannelVideoItemFields,
} from "./compute";
import type {
  YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE,
  YOUTUBE_CHANNEL_PLAYLIST_INTELLIGENCE_FIELDS,
} from "./types";

const EMPTY_WATCH_META: YOUTUBE_VIDEO_WATCH_META = {
  publishedAt: null,
  lengthSeconds: null,
  channelSubscribers: null,
  likeCount: null,
  commentCount: null,
};

function isChannelVideoItem(
  item: YOUTUBE_CHANNEL_RESPONSE["items"][number],
): item is YOUTUBE_CHANNEL_VIDEO_ITEM {
  return "videoId" in item;
}

function isChannelShortItem(
  item: YOUTUBE_CHANNEL_RESPONSE["items"][number],
): item is YOUTUBE_CHANNEL_SHORT_ITEM {
  return "shortId" in item;
}

function isChannelPlaylistItem(
  item: YOUTUBE_CHANNEL_RESPONSE["items"][number],
): item is YOUTUBE_CHANNEL_PLAYLIST_ITEM {
  return "playlistId" in item;
}

function collectWatchMetaVideoIds(
  harvest: ChannelIntelligenceHarvest,
): string[] {
  const videoIds = new Set<string>();

  for (const item of harvest.videosTab.items as YOUTUBE_CHANNEL_VIDEO_ITEM[]) {
    videoIds.add(item.videoId);
  }

  for (const item of harvest.shortsTab.items as YOUTUBE_CHANNEL_SHORT_ITEM[]) {
    videoIds.add(item.shortId);
  }

  return [...videoIds];
}

export async function enrichChannelResults(
  harvest: ChannelIntelligenceHarvest,
  harvestedAt: Date = new Date(),
  geo: { country: string; region?: string },
): Promise<YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE> {
  const { primary, videosTab, shortsTab } = harvest;
  const videoIds = collectWatchMetaVideoIds(harvest);
  const watchMetaByVideoId: Map<string, YOUTUBE_VIDEO_WATCH_META> =
    videoIds.length > 0
      ? await fetchVideoWatchMetaByVideoIds(videoIds, geo)
      : new Map();

  const enrichContext = {
    videosTab: videosTab.items as YOUTUBE_CHANNEL_VIDEO_ITEM[],
    shortsTab: shortsTab.items as YOUTUBE_CHANNEL_SHORT_ITEM[],
    watchMetaByVideoId,
    harvestedAt,
  };

  const intelligence = enrichChannelInfoFields(
    primary.channelInfo,
    enrichContext,
  );

  const videoItems =
    primary.contentType === YT_CHANNEL_CONTENT_TYPE.VIDEOS
      ? (primary.items as YOUTUBE_CHANNEL_VIDEO_ITEM[])
      : enrichContext.videosTab;

  const channelAvgViews = computeChannelAvgViews(videoItems);
  const videoContext = { videoItems, channelAvgViews, harvestedAt };

  const shortItems =
    primary.contentType === YT_CHANNEL_CONTENT_TYPE.SHORTS
      ? (primary.items as YOUTUBE_CHANNEL_SHORT_ITEM[])
      : enrichContext.shortsTab;

  const channelAvgShortViews = computeChannelAvgViews(shortItems);
  const shortContext = {
    shortItems,
    channelAvgViews: channelAvgShortViews,
    harvestedAt,
  };

  return {
    ...primary,
    items: primary.items.map((item) => {
      if (isChannelVideoItem(item)) {
        const watchMeta =
          watchMetaByVideoId.get(item.videoId) ?? EMPTY_WATCH_META;

        return {
          ...item,
          publishedAt: watchMeta.publishedAt,
          duration: watchMeta.lengthSeconds,
          likeCount: watchMeta.likeCount,
          commentCount: watchMeta.commentCount,
          intelligence: enrichChannelVideoItemFields(item, {
            ...videoContext,
            watchMeta,
          }),
        };
      }

      if (isChannelShortItem(item)) {
        const watchMeta =
          watchMetaByVideoId.get(item.shortId) ?? EMPTY_WATCH_META;

        return {
          ...item,
          publishedAt: watchMeta.publishedAt,
          duration: watchMeta.lengthSeconds,
          intelligence: enrichChannelShortItemFields(item, {
            ...shortContext,
            watchMeta,
          }),
        };
      }

      if (isChannelPlaylistItem(item)) {
        const playlistIntelligence: YOUTUBE_CHANNEL_PLAYLIST_INTELLIGENCE_FIELDS =
          {};
        return { ...item, intelligence: playlistIntelligence };
      }

      throw new Error("Unknown channel content item shape");
    }),
    intelligence,
  };
}
