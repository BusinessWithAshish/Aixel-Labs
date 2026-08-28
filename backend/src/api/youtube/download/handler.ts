import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { YoutubeDownloadError } from "./errors";
import { downloadYoutubeMedia } from "./helpers";
import { YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";

export const youtubeVideoDownloadHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO_DOWNLOAD,
  schema: YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA,
  fetch: downloadYoutubeMedia,
  mapError: (err) => {
    if (err instanceof YoutubeDownloadError) {
      return { statusCode: err.statusCode, message: err.message };
    }
    return null;
  },
});
