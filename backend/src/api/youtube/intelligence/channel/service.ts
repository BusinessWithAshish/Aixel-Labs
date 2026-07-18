import type { z } from "zod";
import type { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../channel/schemas";
import { resolveYoutubeHandleToChannelId } from "../../handle/helpers";
import { enrichChannelResults } from "./enrich";
import { fetchChannelIntelligenceHarvest } from "./harvest";
import type { YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE } from "./types";

export type ChannelIntelligenceInput = z.infer<
  typeof YOUTUBE_CHANNEL_REQUEST_SCHEMA
>;

export async function channelIntelligenceService(
  input: ChannelIntelligenceInput,
): Promise<YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE> {
  const {
    channelId: inputChannelId,
    handle,
    contentType,
    limit,
    country,
    region,
  } = input;

  const channelId =
    inputChannelId ??
    (await resolveYoutubeHandleToChannelId(handle!, { country, region }));

  const harvest = await fetchChannelIntelligenceHarvest({
    channelId,
    contentType,
    limit,
    country,
    region,
  });

  const harvestedAt = new Date();
  return enrichChannelResults(harvest, harvestedAt, {
    country,
    region,
  });
}
