import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../../search/schemas";
import { fetchYoutubeSearch } from "../../search/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { enrichSearchResults } from "./enrich";

export const youtubeSearchIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.SEARCH,
  schema: YOUTUBE_SEARCH_REQUEST_SCHEMA,
  fetch: fetchYoutubeSearch,
  enrich: async (raw, input) => {
    const harvestedAt = new Date();
    return enrichSearchResults(raw, harvestedAt, {
      country: input.country,
      region: input.region,
    });
  },
});
