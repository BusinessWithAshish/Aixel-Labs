import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeVideoMeta } from "./helpers";

export const youtubeVideoMetaHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.VIDEO_META,
  schema: YOUTUBE_VIDEO_META_REQUEST_SCHEMA,
  fetch: fetchYoutubeVideoMeta,
});
