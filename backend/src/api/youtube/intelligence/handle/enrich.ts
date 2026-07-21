import type { YOUTUBE_HANDLE_RESPONSE } from "../../handle/types";
import { computeChannelTier } from "../compute";
import type {
  YOUTUBE_HANDLE_INTELLIGENCE_FIELDS,
  YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE,
} from "./types";

export function enrichHandleResults(
  raw: YOUTUBE_HANDLE_RESPONSE,
): YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE {
  const intelligence: YOUTUBE_HANDLE_INTELLIGENCE_FIELDS = {
    channelTier: computeChannelTier(raw.subscribers),
  };

  return { ...raw, intelligence };
}
