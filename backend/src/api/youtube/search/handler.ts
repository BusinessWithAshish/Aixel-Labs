import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeSearch } from "./helpers";

export const youtubeSearchHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.SEARCH,
  schema: YOUTUBE_SEARCH_REQUEST_SCHEMA,
  fetch: fetchYoutubeSearch,
});
