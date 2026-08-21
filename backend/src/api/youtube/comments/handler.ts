import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { fetchYoutubeVideoComments, YoutubeVideoError } from "./helpers";
import { YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA } from "./schemas";

export const youtubeVideoCommentsHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO_COMMENTS,
  schema: YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA,
  fetch: fetchYoutubeVideoComments,
  mapError: (err) => {
    if (err instanceof YoutubeVideoError) {
      return { statusCode: err.statusCode, message: err.message };
    }
    return null;
  },
});
