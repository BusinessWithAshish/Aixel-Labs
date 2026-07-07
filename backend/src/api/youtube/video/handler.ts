import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import {
  YOUTUBE_VIDEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
} from "./schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
  YoutubeVideoError,
} from "./helpers";

function mapYoutubeVideoError(err: unknown) {
  if (err instanceof YoutubeVideoError) {
    return { statusCode: err.statusCode, message: err.message };
  }
  return null;
}

export const youtubeVideoHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO,
  schema: YOUTUBE_VIDEO_REQUEST_SCHEMA,
  fetch: fetchYoutubeVideoDetails,
  mapError: mapYoutubeVideoError,
});

export const youtubeVideoSuggestedVideosHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO_SUGGESTED,
  schema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
  fetch: fetchYoutubeVideoSuggestedVideos,
  mapError: mapYoutubeVideoError,
});
