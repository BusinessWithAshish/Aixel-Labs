import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { fetchYoutubeHandleCheck } from "./helpers";
import { YOUTUBE_HANDLE_CHECK_REQUEST_SCHEMA } from "./schemas";

export const youtubeHandleCheckHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.HANDLE_CHECK,
  schema: YOUTUBE_HANDLE_CHECK_REQUEST_SCHEMA,
  fetch: fetchYoutubeHandleCheck,
});
