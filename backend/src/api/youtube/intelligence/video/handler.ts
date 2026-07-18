import { YOUTUBE_VIDEO_REQUEST_SCHEMA } from "../../video/schemas";
import { YoutubeVideoError } from "../../video/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { videoIntelligenceService } from "./service";

export const youtubeVideoIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.VIDEO,
  schema: YOUTUBE_VIDEO_REQUEST_SCHEMA,
  fetch: videoIntelligenceService,
  enrich: (data) => data,
  mapError: (err) => {
    if (err instanceof YoutubeVideoError) {
      return { statusCode: err.statusCode, message: err.message };
    }
    return null;
  },
});
