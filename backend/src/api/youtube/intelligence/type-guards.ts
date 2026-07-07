import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../search/types";
import type {
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
} from "../channel/types";

import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
  YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE,
} from "./search/types";

export function isSearchVideoItem(item: {
  videoId?: string | null;
  channelId?: string | null;
}): item is YOUTUBE_SEARCH_VIDEO_ITEM {
  return "videoId" in item;
}

export function isSearchChannelItem(item: {
  videoId?: string | null;
  channelId?: string | null;
}): item is YOUTUBE_SEARCH_CHANNEL_ITEM {
  return "channelId" in item && !("videoId" in item);
}

export function isSearchVideoItemIntelligence(
  item:
    | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
    | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
): item is YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE {
  return "videoId" in item;
}

export function isSearchChannelItemIntelligence(
  item:
    | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
    | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE,
): item is YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE {
  return "channelId" in item && !("videoId" in item);
}

export function isChannelVideoItem(item: {
  videoId?: string;
  shortId?: string;
  playlistId?: string;
}): item is YOUTUBE_CHANNEL_VIDEO_ITEM {
  return "videoId" in item;
}

export function isChannelShortItem(item: {
  videoId?: string;
  shortId?: string;
  playlistId?: string;
}): item is YOUTUBE_CHANNEL_SHORT_ITEM {
  return "shortId" in item;
}

export function isChannelPlaylistItem(item: {
  videoId?: string;
  shortId?: string;
  playlistId?: string;
}): item is YOUTUBE_CHANNEL_PLAYLIST_ITEM {
  return "playlistId" in item;
}

export function resolveSearchVideoId(item: {
  videoId?: string | null;
  id?: string | null;
}): string | null {
  return item.videoId ?? item.id ?? null;
}
