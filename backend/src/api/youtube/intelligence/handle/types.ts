import type { WithIntelligence } from "../types";
import type { YOUTUBE_CHANNEL_TIER } from "../../constants";
import type { YOUTUBE_HANDLE_RESPONSE } from "../../handle/types";

export type YOUTUBE_HANDLE_INTELLIGENCE_FIELDS = {
  channelTier: YOUTUBE_CHANNEL_TIER | null;
};

export type YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE = WithIntelligence<
  YOUTUBE_HANDLE_RESPONSE,
  YOUTUBE_HANDLE_INTELLIGENCE_FIELDS
>;
