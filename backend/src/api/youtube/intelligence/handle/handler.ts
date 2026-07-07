import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../../handle/schemas";
import { fetchYoutubeHandle } from "../../handle/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { enrichHandleResults } from "./enrich";

export const youtubeHandleIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.HANDLE,
  schema: YOUTUBE_HANDLE_REQUEST_SCHEMA,
  fetch: fetchYoutubeHandle,
  enrich: (raw) => enrichHandleResults(raw),
});
