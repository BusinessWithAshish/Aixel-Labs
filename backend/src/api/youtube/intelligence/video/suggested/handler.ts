import { YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA } from "../../../video/schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
  YoutubeVideoError,
} from "../../../video/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../../constants";
import { createIntelligenceHandler } from "../../create-handler";
import { enrichSuggestedVideos } from "./enrich";
import type { SuggestedVideosIntelligenceHarvest } from "./enrich";

async function fetchSuggestedVideosIntelligenceHarvest(
  request: Parameters<typeof fetchYoutubeVideoSuggestedVideos>[0],
): Promise<SuggestedVideosIntelligenceHarvest> {
  const [sourceVideo, suggested] = await Promise.all([
    fetchYoutubeVideoDetails(request),
    fetchYoutubeVideoSuggestedVideos(request),
  ]);

  return {
    sourceChannelId: sourceVideo.channelId,
    suggested,
  };
}

export const youtubeVideoSuggestedIntelligenceHandler =
  createIntelligenceHandler({
    label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO_SUGGESTED,
    schema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
    fetch: fetchSuggestedVideosIntelligenceHarvest,
    enrich: async (harvest, input) => {
      const harvestedAt = new Date();
      return enrichSuggestedVideos(harvest, harvestedAt, {
        country: input.country,
        region: input.region,
      });
    },
    mapError: (err) => {
      if (err instanceof YoutubeVideoError) {
        return { statusCode: err.statusCode, message: err.message };
      }
      return null;
    },
  });
