import type { WithIntelligence } from "../types";
import type { YOUTUBE_HANDLE_RESPONSE } from "../../handle/types";

export type YOUTUBE_HANDLE_INTELLIGENCE_FIELDS = Record<string, never>;

export type YOUTUBE_HANDLE_INTELLIGENCE_RESPONSE = WithIntelligence<
  YOUTUBE_HANDLE_RESPONSE,
  YOUTUBE_HANDLE_INTELLIGENCE_FIELDS
>;
