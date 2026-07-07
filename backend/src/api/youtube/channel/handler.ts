import { YOUTUBE_HANDLER_LABELS } from "../constants";
import { createYoutubeHandler } from "../create-handler";
import { resolveYoutubeHandleToChannelId } from "../handle/helpers";
import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeChannel } from "./helpers";

export const youtubeChannelHandler = createYoutubeHandler({
  label: YOUTUBE_HANDLER_LABELS.CHANNEL,
  schema: YOUTUBE_CHANNEL_REQUEST_SCHEMA,
  resolveInput: async (input) => {
    if (input.channelId) return input;

    const channelId = await resolveYoutubeHandleToChannelId(input.handle!, {
      country: input.country,
      region: input.region,
    });

    return { ...input, channelId };
  },
  fetch: ({ channelId, contentType, limit, country, region }) =>
    fetchYoutubeChannel({
      channelId: channelId!,
      contentType,
      limit,
      country,
      region,
    }),
});
