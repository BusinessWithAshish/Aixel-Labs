import { z } from "zod";
import { YOUTUBE_VIDEO_PARAMS_SCHEMA } from "./schemas";
import type { YT_SEARCH_ITEM, YT_THUMBNAIL } from "../types";

export type YOUTUBE_VIDEO_PARAMS = z.infer<typeof YOUTUBE_VIDEO_PARAMS_SCHEMA>;

export type YOUTUBE_VIDEO_DETAILS_RESPONSE = {
  id: string;
  title: string;
  thumbnail: YT_THUMBNAIL[] | null;
  isLive: boolean;
  channel: string;
  channelId: string;
  description: string;
  keywords: string[];
  suggestions: YT_SEARCH_ITEM[];
};
