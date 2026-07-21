import { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA } from "./schemas";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { transcriptIntelligenceService } from "./service";

export const youtubeTranscriptIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO_TRANSCRIPT,
  schema: YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA,
  fetch: transcriptIntelligenceService,
  enrich: (data) => data,
});
