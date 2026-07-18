import type { z } from "zod";
import type { YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA } from "../../../video/schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
} from "../../../video/helpers";
import {
  enrichSuggestedVideos,
  type SuggestedVideosIntelligenceHarvest,
} from "./enrich";
import type { YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE } from "./types";

export type VideoSuggestionsIntelligenceInput = z.infer<
  typeof YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA
>;

async function fetchSuggestedVideosIntelligenceHarvest(
  request: VideoSuggestionsIntelligenceInput,
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

export async function videoSuggestionsIntelligenceService(
  input: VideoSuggestionsIntelligenceInput,
): Promise<YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE> {
  const harvest = await fetchSuggestedVideosIntelligenceHarvest(input);
  const harvestedAt = new Date();
  return enrichSuggestedVideos(harvest, harvestedAt, {
    country: input.country,
    region: input.region,
  });
}
