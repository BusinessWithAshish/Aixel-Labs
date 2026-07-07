import type { YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE } from "../../../video/types";
import { fetchVideoWatchMetaByVideoIds } from "../../../video-meta";
import { createEmptyWatchMetaMap, resolveWatchMeta } from "../../watch-meta";
import {
  enrichSuggestionItemFields,
  computeSuggestedAggregateIntelligence,
} from "./compute";
import type { YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE } from "./types";
import type { YOUTUBE_INTELLIGENCE_GEO_INPUT } from "../../types";

export type SuggestedVideosIntelligenceHarvest = {
  sourceChannelId: string | null;
  suggested: YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE;
};

export async function enrichSuggestedVideos(
  harvest: SuggestedVideosIntelligenceHarvest,
  harvestedAt: Date = new Date(),
  geo: YOUTUBE_INTELLIGENCE_GEO_INPUT,
): Promise<YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE> {
  const { sourceChannelId, suggested } = harvest;

  const videoIds = suggested.items.map((item) => item.videoId);
  const watchMetaByVideoId =
    videoIds.length > 0
      ? await fetchVideoWatchMetaByVideoIds(videoIds, geo)
      : createEmptyWatchMetaMap();

  const items = suggested.items.map((item, index) => {
    const watchMeta = resolveWatchMeta(watchMetaByVideoId, item.videoId);

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
