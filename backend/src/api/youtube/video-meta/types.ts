import type { z } from "zod";
import type { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_VIDEO_META_REQUEST = z.infer<
  typeof YOUTUBE_VIDEO_META_REQUEST_SCHEMA
>;

export type YOUTUBE_VIDEO_META_ITEM = {
  videoId: string;
  publishedAt: string | null;
  lengthSeconds: number | null;
  channelSubscribers: number | null;
  likeCount: number | null;
  commentCount: number | null;
  description: string | null;
};

export type YOUTUBE_VIDEO_META_RESPONSE = {
  items: YOUTUBE_VIDEO_META_ITEM[];
  requested: number;
  resolved: number;
};
