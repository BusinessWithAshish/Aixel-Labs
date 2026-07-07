import type {
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
  YOUTUBE_CHANNEL_RESPONSE,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../../channel/types";
import { YT_CHANNEL_CONTENT_TYPE } from "../../channel/constants";
import { fetchVideoWatchMetaByVideoIds } from "../../video-meta";
import type { ChannelIntelligenceHarvest } from "./harvest";
import { createEmptyWatchMetaMap, resolveWatchMeta } from "../watch-meta";
import {
  isChannelPlaylistItem,
  isChannelShortItem,
  isChannelVideoItem,
} from "../type-guards";
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
import type { YOUTUBE_INTELLIGENCE_GEO_INPUT } from "../types";

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
  geo: YOUTUBE_INTELLIGENCE_GEO_INPUT,
): Promise<YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE> {
  const { primary, videosTab, shortsTab } = harvest;
  const videoIds = collectWatchMetaVideoIds(harvest);
  const watchMetaByVideoId =
    videoIds.length > 0
      ? await fetchVideoWatchMetaByVideoIds(videoIds, geo)
      : createEmptyWatchMetaMap();

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
        const watchMeta = resolveWatchMeta(watchMetaByVideoId, item.videoId);

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
        const watchMeta = resolveWatchMeta(watchMetaByVideoId, item.shortId);

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
