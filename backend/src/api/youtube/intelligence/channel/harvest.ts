import { fetchYoutubeChannel } from "../../channel/helpers";
import { YT_CHANNEL_CONTENT_TYPE } from "../../channel/constants";
import { YOUTUBE_DEFAULT_LIMIT } from "../../constants";
import type { YOUTUBE_CHANNEL_RESPONSE } from "../../channel/types";
import type { z } from "zod";
import type { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../channel/schemas";

export type ChannelIntelligenceHarvest = {
  primary: YOUTUBE_CHANNEL_RESPONSE;
  videosTab: YOUTUBE_CHANNEL_RESPONSE;
  shortsTab: YOUTUBE_CHANNEL_RESPONSE;
  /** Fetch limit applied to each tab sample (for shortRatio censoring). */
  fetchLimit: number;
};

type ChannelIntelligenceRequest = z.infer<
  typeof YOUTUBE_CHANNEL_REQUEST_SCHEMA
> & {
  channelId: string;
};

function emptyTabResponse(
  channelId: string,
  contentType: YT_CHANNEL_CONTENT_TYPE,
  channelInfo: YOUTUBE_CHANNEL_RESPONSE["channelInfo"] = null,
): YOUTUBE_CHANNEL_RESPONSE {
  return {
    channelId,
    channelInfo,
    contentType,
    items: [],
    totalResults: 0,
  };
}

export async function fetchChannelIntelligenceHarvest(
  request: ChannelIntelligenceRequest,
): Promise<ChannelIntelligenceHarvest> {
  const { channelId, contentType, limit, country, region } = request;
  const fetchLimit = limit ?? YOUTUBE_DEFAULT_LIMIT;
  const base = { channelId, limit: fetchLimit, country, region };
  const resolvedContentType = contentType ?? YT_CHANNEL_CONTENT_TYPE.VIDEOS;

  const needVideosTab = resolvedContentType !== YT_CHANNEL_CONTENT_TYPE.VIDEOS;
  const needShortsTab = resolvedContentType !== YT_CHANNEL_CONTENT_TYPE.SHORTS;

  // Primary must fail hard for the caller's requested tab. Auxiliary tabs
  // soft-fail so a missing Shorts tab does not kill videos intelligence.
  const primary = await fetchYoutubeChannel({
    ...base,
    contentType: resolvedContentType,
  });

  const [videosTabExtra, shortsTabExtra] = await Promise.all([
    needVideosTab
      ? fetchYoutubeChannel({
          ...base,
          contentType: YT_CHANNEL_CONTENT_TYPE.VIDEOS,
        }).catch(() =>
          emptyTabResponse(
            channelId,
            YT_CHANNEL_CONTENT_TYPE.VIDEOS,
            primary.channelInfo,
          ),
        )
      : Promise.resolve(null),
    needShortsTab
      ? fetchYoutubeChannel({
          ...base,
          contentType: YT_CHANNEL_CONTENT_TYPE.SHORTS,
        }).catch(() =>
          emptyTabResponse(
            channelId,
            YT_CHANNEL_CONTENT_TYPE.SHORTS,
            primary.channelInfo,
          ),
        )
      : Promise.resolve(null),
  ]);

  return {
    primary,
    videosTab:
      resolvedContentType === YT_CHANNEL_CONTENT_TYPE.VIDEOS
        ? primary
        : videosTabExtra!,
    shortsTab:
      resolvedContentType === YT_CHANNEL_CONTENT_TYPE.SHORTS
        ? primary
        : shortsTabExtra!,
    fetchLimit,
  };
}
