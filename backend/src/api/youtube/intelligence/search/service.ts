import type { z } from "zod";
import type { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../../search/schemas";
import { fetchYoutubeSearch } from "../../search/helpers";
import { enrichSearchResults } from "./enrich";
import type { YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE } from "./types";

export type SearchIntelligenceInput = z.infer<
  typeof YOUTUBE_SEARCH_REQUEST_SCHEMA
>;

export async function searchIntelligenceService(
  input: SearchIntelligenceInput,
): Promise<YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE> {
  const raw = await fetchYoutubeSearch(input);
  const harvestedAt = new Date();
  return enrichSearchResults(raw, harvestedAt, {
    country: input.country,
    region: input.region,
  });
}
