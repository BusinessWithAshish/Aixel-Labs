import { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "../../suggest/schemas";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { suggestIntelligenceService } from "./service";

export const youtubeSuggestIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.SUGGEST,
  schema: YOUTUBE_SUGGEST_REQUEST_SCHEMA,
  fetch: suggestIntelligenceService,
  enrich: (data) => data,
});
