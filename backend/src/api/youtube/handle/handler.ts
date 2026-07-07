import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeHandle } from "./helpers";

export const youtubeHandleHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.HANDLE,
  schema: YOUTUBE_HANDLE_REQUEST_SCHEMA,
  fetch: fetchYoutubeHandle,
});
