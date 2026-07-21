import type { z } from "zod";
import type { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "../../suggest/schemas";
import { enrichSuggestIntelligence } from "./enrich";
import type { YOUTUBE_SUGGEST_INTELLIGENCE_RESPONSE } from "./types";

export type YoutubeSuggestIntelligenceInput = z.infer<
  typeof YOUTUBE_SUGGEST_REQUEST_SCHEMA
>;

export async function suggestIntelligenceService(
  input: YoutubeSuggestIntelligenceInput,
): Promise<YOUTUBE_SUGGEST_INTELLIGENCE_RESPONSE> {
  return enrichSuggestIntelligence(input);
}
