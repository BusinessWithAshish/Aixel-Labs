import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../../search/schemas";
import { fetchYoutubeSearch } from "../../search/helpers";
import { createIntelligenceHandler } from "../create-handler";
import { enrichSearchResults } from "./enrich";

export const youtubeSearchIntelligenceHandler = createIntelligenceHandler({
  label: "YOUTUBE/INTELLIGENCE/SEARCH",
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
