import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../../handle/schemas";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { resolveHandleService } from "./service";

export const youtubeHandleIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.HANDLE,
  schema: YOUTUBE_HANDLE_REQUEST_SCHEMA,
  fetch: resolveHandleService,
  enrich: (data) => data,
});
