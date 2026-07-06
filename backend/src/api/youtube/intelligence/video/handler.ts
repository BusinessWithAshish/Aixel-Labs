import { YOUTUBE_VIDEO_REQUEST_SCHEMA } from "../../video/schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
  YoutubeVideoError,
} from "../../video/helpers";
import { createIntelligenceHandler } from "../create-handler";
import { enrichVideoDetails } from "./enrich";
import type { VideoIntelligenceHarvest } from "./enrich";

async function fetchVideoIntelligenceHarvest(
  request: Parameters<typeof fetchYoutubeVideoDetails>[0],
): Promise<VideoIntelligenceHarvest> {
  const details = await fetchYoutubeVideoDetails(request);

  let suggestionDegree: number | null = null;
  try {
    const suggested = await fetchYoutubeVideoSuggestedVideos(request);
    suggestionDegree = suggested.totalResults;
  } catch (err) {
    console.warn(
      "[YOUTUBE/INTELLIGENCE/VIDEO] Suggested videos fetch failed; suggestionDegree=null",
      err instanceof Error ? err.message : err,
    );
  }

  return { details, suggestionDegree };
}

export const youtubeVideoIntelligenceHandler = createIntelligenceHandler({
  label: "YOUTUBE/INTELLIGENCE/VIDEO",
  schema: YOUTUBE_VIDEO_REQUEST_SCHEMA,
  fetch: fetchVideoIntelligenceHarvest,
  enrich: (raw) => enrichVideoDetails(raw),
  mapError: (err) => {
    if (err instanceof YoutubeVideoError) {
      return { statusCode: err.statusCode, message: err.message };
    }
    return null;
  },
});
