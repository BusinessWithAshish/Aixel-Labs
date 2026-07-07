import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../channel/schemas";
import { resolveYoutubeHandleToChannelId } from "../../handle/helpers";
import { YOUTUBE_INTELLIGENCE_HANDLER_LABELS } from "../constants";
import { createIntelligenceHandler } from "../create-handler";
import { enrichChannelResults } from "./enrich";
import { fetchChannelIntelligenceHarvest } from "./harvest";

export const youtubeChannelIntelligenceHandler = createIntelligenceHandler({
  label: YOUTUBE_INTELLIGENCE_HANDLER_LABELS.CHANNEL,
  schema: YOUTUBE_CHANNEL_REQUEST_SCHEMA,
  fetch: async (data) => {
    const {
      channelId: inputChannelId,
      handle,
      contentType,
      limit,
      country,
      region,
    } = data;

    const channelId =
      inputChannelId ??
      (await resolveYoutubeHandleToChannelId(handle!, { country, region }));

    return fetchChannelIntelligenceHarvest({
      channelId,
      contentType,
      limit,
      country,
      region,
    });
  },
  enrich: async (harvest, input) => {
    const harvestedAt = new Date();
    return enrichChannelResults(harvest, harvestedAt, {
      country: input.country,
      region: input.region,
    });
  },
});
