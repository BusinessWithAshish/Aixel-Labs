import type { YOUTUBE_VIDEO_COMMENTS_REQUEST } from "../../comments/types";
import { enrichCommentsIntelligence } from "./enrich";
import type { YOUTUBE_COMMENTS_INTELLIGENCE_RESPONSE } from "./types";

export async function commentsIntelligenceService(
  input: YOUTUBE_VIDEO_COMMENTS_REQUEST,
): Promise<YOUTUBE_COMMENTS_INTELLIGENCE_RESPONSE> {
  return enrichCommentsIntelligence(input);
}
