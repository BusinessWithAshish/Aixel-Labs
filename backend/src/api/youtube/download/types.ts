import type { z } from "zod";
import type { YOUTUBE_DOWNLOAD_MEDIA } from "./constants";
import type { YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_VIDEO_DOWNLOAD_REQUEST = z.infer<
  typeof YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA
>;

export type YOUTUBE_DOWNLOAD_MEDIA_VALUE =
  (typeof YOUTUBE_DOWNLOAD_MEDIA)[keyof typeof YOUTUBE_DOWNLOAD_MEDIA];

export type YOUTUBE_VIDEO_DOWNLOAD_RESPONSE = {
  videoId: string;
  title: string;
  durationSeconds: number;
  filePath: string;
  mimeType: string;
  bytes: number;
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE;
};
