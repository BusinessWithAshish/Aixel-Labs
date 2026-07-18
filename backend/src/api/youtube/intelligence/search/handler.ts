import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../../search/schemas";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { searchIntelligenceService } from "./service";

export const youtubeSearchIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.SEARCH,
  schema: YOUTUBE_SEARCH_REQUEST_SCHEMA,
  fetch: searchIntelligenceService,
  enrich: (data) => data,
});
