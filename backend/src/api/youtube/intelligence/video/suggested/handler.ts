import { YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA } from "../../../video/schemas";
import { YoutubeVideoError } from "../../../video/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../../constants";
import { createIntelligenceHandler } from "../../create-handler";
import { videoSuggestionsIntelligenceService } from "./service";

export const youtubeVideoSuggestedIntelligenceHandler =
  createIntelligenceHandler({
    label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO_SUGGESTED,
    schema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
    fetch: videoSuggestionsIntelligenceService,
    enrich: (data) => data,
    mapError: (err) => {
      if (err instanceof YoutubeVideoError) {
        return { statusCode: err.statusCode, message: err.message };
      }
      return null;
    },
  });
