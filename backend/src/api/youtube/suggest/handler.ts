import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { fetchYoutubeSuggest } from "./helpers";
import { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "./schemas";

export const youtubeSuggestHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.SUGGEST,
  schema: YOUTUBE_SUGGEST_REQUEST_SCHEMA,
  fetch: fetchYoutubeSuggest,
});
