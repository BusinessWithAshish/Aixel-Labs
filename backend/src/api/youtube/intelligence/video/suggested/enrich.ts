import type { YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE } from "../../../video/types";
import {
  fetchVideoWatchMetaByVideoIds,
  type YOUTUBE_VIDEO_WATCH_META,
} from "../../../video-meta";
import {
  enrichSuggestionItemFields,
  computeSuggestedAggregateIntelligence,
} from "./compute";
import type { YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE } from "./types";

const EMPTY_WATCH_META: YOUTUBE_VIDEO_WATCH_META = {
  publishedAt: null,
  lengthSeconds: null,
  channelSubscribers: null,
  likeCount: null,
  commentCount: null,
};

export type SuggestedVideosIntelligenceHarvest = {
  sourceChannelId: string | null;
  suggested: YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE;
};

export async function enrichSuggestedVideos(
  harvest: SuggestedVideosIntelligenceHarvest,
  harvestedAt: Date = new Date(),
  geo: { country: string; region?: string },
): Promise<YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE> {
  const { sourceChannelId, suggested } = harvest;

  const videoIds = suggested.items.map((item) => item.videoId);
  const watchMetaByVideoId =
    videoIds.length > 0
      ? await fetchVideoWatchMetaByVideoIds(videoIds, geo)
      : new Map<string, YOUTUBE_VIDEO_WATCH_META>();

  const items = suggested.items.map((item, index) => {
    const watchMeta = watchMetaByVideoId.get(item.videoId) ?? EMPTY_WATCH_META;

    return {
      ...item,
      publishedAt: watchMeta.publishedAt,
      channelSubscribers: watchMeta.channelSubscribers,
      intelligence: enrichSuggestionItemFields(item, {
        sourceChannelId,
        suggestionPosition: index + 1,
        watchMeta,
        harvestedAt,
      }),
    };
  });

  return {
    ...suggested,
    items,
    intelligence: computeSuggestedAggregateIntelligence(items),
  };
}
