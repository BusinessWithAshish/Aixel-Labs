import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_RESPONSE,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../../search/types";
import {
  fetchVideoWatchMetaByVideoIds,
  type YOUTUBE_VIDEO_WATCH_META,
} from "../../video-meta";
import {
  enrichSearchChannelItemFields,
  enrichSearchVideoItemFields,
  computeSearchAggregateIntelligence,
} from "./compute";
import type {
  YOUTUBE_SEARCH_CHANNEL_INTELLIGENCE_FIELDS,
  YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE,
} from "./types";

const EMPTY_WATCH_META: YOUTUBE_VIDEO_WATCH_META = {
  publishedAt: null,
  lengthSeconds: null,
  channelSubscribers: null,
  likeCount: null,
  commentCount: null,
};

function isSearchVideoItem(
  item: YOUTUBE_SEARCH_RESPONSE["items"][number],
): item is YOUTUBE_SEARCH_VIDEO_ITEM {
  return "videoId" in item;
}

function isSearchChannelItem(
  item: YOUTUBE_SEARCH_RESPONSE["items"][number],
): item is YOUTUBE_SEARCH_CHANNEL_ITEM {
  return "channelId" in item && !("videoId" in item);
}

function enrichSearchVideoItem(
  item: YOUTUBE_SEARCH_VIDEO_ITEM,
  watchMetaByVideoId: Map<string, YOUTUBE_VIDEO_WATCH_META>,
  harvestedAt: Date,
): YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE["items"][number] {
  const videoId = item.videoId ?? item.id;
  const watchMeta = videoId
    ? (watchMetaByVideoId.get(videoId) ?? EMPTY_WATCH_META)
    : EMPTY_WATCH_META;

  return {
    ...item,
    publishedAt: watchMeta.publishedAt,
    channelSubscribers: watchMeta.channelSubscribers,
    intelligence: enrichSearchVideoItemFields(item, watchMeta, harvestedAt),
  };
}

function enrichSearchChannelItem(
  item: YOUTUBE_SEARCH_CHANNEL_ITEM,
): YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE["items"][number] {
  const intelligence: YOUTUBE_SEARCH_CHANNEL_INTELLIGENCE_FIELDS =
    enrichSearchChannelItemFields(item);
  return { ...item, intelligence };
}

function collectSearchVideoIds(raw: YOUTUBE_SEARCH_RESPONSE): string[] {
  const ids: string[] = [];

  for (const item of raw.items) {
    if (!isSearchVideoItem(item)) continue;
    const videoId = item.videoId ?? item.id;
    if (videoId) ids.push(videoId);
  }

  return ids;
}

export async function enrichSearchResults(
  raw: YOUTUBE_SEARCH_RESPONSE,
  harvestedAt: Date = new Date(),
  geo: { country: string; region?: string },
): Promise<YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE> {
  const videoIds = collectSearchVideoIds(raw);

  const watchMetaByVideoId =
    videoIds.length > 0
      ? await fetchVideoWatchMetaByVideoIds(videoIds, geo)
      : new Map<string, YOUTUBE_VIDEO_WATCH_META>();

  const items = raw.items.map((item) => {
    if (isSearchVideoItem(item)) {
      return enrichSearchVideoItem(item, watchMetaByVideoId, harvestedAt);
    }
    if (isSearchChannelItem(item)) {
      return enrichSearchChannelItem(item);
    }
    return item as YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE["items"][number];
  });

  const intelligence = computeSearchAggregateIntelligence(
    items,
    raw.estimatedResults,
  );

  return {
    ...raw,
    items,
    intelligence,
  };
}
