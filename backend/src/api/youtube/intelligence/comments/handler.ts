import { YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA } from "../../comments/schemas";
import { YoutubeVideoError } from "../../comments/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { commentsIntelligenceService } from "./service";

export const youtubeCommentsIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO_COMMENTS,
  schema: YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA,
  fetch: commentsIntelligenceService,
  enrich: (data) => data,
  mapError: (err) => {
    if (err instanceof YoutubeVideoError) {
      return { statusCode: err.statusCode, message: err.message };
    }
    return null;
  },
});
