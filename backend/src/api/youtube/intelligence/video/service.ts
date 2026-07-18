import type { z } from "zod";
import type { YOUTUBE_VIDEO_REQUEST_SCHEMA } from "../../video/schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
} from "../../video/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { enrichVideoDetails, type VideoIntelligenceHarvest } from "./enrich";
import type { YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE } from "./types";

export type VideoIntelligenceInput = z.infer<
  typeof YOUTUBE_VIDEO_REQUEST_SCHEMA
>;

async function fetchVideoIntelligenceHarvest(
  request: VideoIntelligenceInput,
): Promise<VideoIntelligenceHarvest> {
  const details = await fetchYoutubeVideoDetails(request);

  let suggestionDegree: number | null = null;
  try {
    const suggested = await fetchYoutubeVideoSuggestedVideos(request);
    suggestionDegree = suggested.totalResults;
  } catch (err) {
    console.error(
      `[${YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO}] Suggested videos fetch failed; suggestionDegree=null`,
      err instanceof Error ? err.message : err,
    );
  }

  return { details, suggestionDegree };
}

export async function videoIntelligenceService(
  input: VideoIntelligenceInput,
): Promise<YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE> {
  const harvest = await fetchVideoIntelligenceHarvest(input);
  return enrichVideoDetails(harvest);
}
