import { fetchYoutubeChannel } from "../../channel/helpers";
import { YT_CHANNEL_CONTENT_TYPE } from "../../channel/constants";
import type { YOUTUBE_CHANNEL_RESPONSE } from "../../channel/types";
import type { z } from "zod";
import type { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../channel/schemas";

export type ChannelIntelligenceHarvest = {
  primary: YOUTUBE_CHANNEL_RESPONSE;
  videosTab: YOUTUBE_CHANNEL_RESPONSE;
  shortsTab: YOUTUBE_CHANNEL_RESPONSE;
};

type ChannelIntelligenceRequest = z.infer<
  typeof YOUTUBE_CHANNEL_REQUEST_SCHEMA
> & {
  channelId: string;
};

export async function fetchChannelIntelligenceHarvest(
  request: ChannelIntelligenceRequest,
): Promise<ChannelIntelligenceHarvest> {
  const { channelId, contentType, limit, country, region } = request;
  const base = { channelId, limit, country, region };
  const resolvedContentType = contentType ?? YT_CHANNEL_CONTENT_TYPE.VIDEOS;

  const needVideosTab = resolvedContentType !== YT_CHANNEL_CONTENT_TYPE.VIDEOS;
  const needShortsTab = resolvedContentType !== YT_CHANNEL_CONTENT_TYPE.SHORTS;

  const [primary, videosTabExtra, shortsTabExtra] = await Promise.all([
    fetchYoutubeChannel({ ...base, contentType: resolvedContentType }),
    needVideosTab
      ? fetchYoutubeChannel({
          ...base,
          contentType: YT_CHANNEL_CONTENT_TYPE.VIDEOS,
        })
      : Promise.resolve(null),
    needShortsTab
      ? fetchYoutubeChannel({
          ...base,
          contentType: YT_CHANNEL_CONTENT_TYPE.SHORTS,
        })
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
  };
}
