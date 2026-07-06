import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../../handle/schemas";
import { fetchYoutubeHandle } from "../../handle/helpers";
import { createIntelligenceHandler } from "../create-handler";
import { enrichHandleResults } from "./enrich";

export const youtubeHandleIntelligenceHandler = createIntelligenceHandler({
  label: "YOUTUBE/INTELLIGENCE/HANDLE",
  schema: YOUTUBE_HANDLE_REQUEST_SCHEMA,
  fetch: fetchYoutubeHandle,
  enrich: (raw) => enrichHandleResults(raw),
});
