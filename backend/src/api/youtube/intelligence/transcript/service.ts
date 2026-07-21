import type { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST } from "./schemas";
import { enrichTranscriptIntelligence } from "./enrich";
import type { YOUTUBE_TRANSCRIPT_INTELLIGENCE_RESPONSE } from "./types";

export type YoutubeTranscriptIntelligenceInput =
  YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST;

export async function transcriptIntelligenceService(
  input: YoutubeTranscriptIntelligenceInput,
): Promise<YOUTUBE_TRANSCRIPT_INTELLIGENCE_RESPONSE> {
  return enrichTranscriptIntelligence(input);
}
