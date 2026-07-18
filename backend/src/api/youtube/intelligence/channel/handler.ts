import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../channel/schemas";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { channelIntelligenceService } from "./service";

export const youtubeChannelIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.CHANNEL,
  schema: YOUTUBE_CHANNEL_REQUEST_SCHEMA,
  fetch: channelIntelligenceService,
  enrich: (data) => data,
});
