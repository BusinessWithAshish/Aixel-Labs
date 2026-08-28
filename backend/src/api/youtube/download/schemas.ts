import { z } from "zod";
import { YOUTUBE_GEO_REQUEST_SCHEMA } from "../schemas";
import {
  YOUTUBE_DOWNLOAD_FIELD_DESCRIPTIONS,
  YOUTUBE_DOWNLOAD_MEDIA,
} from "./constants";

export const YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA =
  YOUTUBE_GEO_REQUEST_SCHEMA.extend({
    videoId: z
      .string()
      .trim()
      .min(1)
      .describe(YOUTUBE_DOWNLOAD_FIELD_DESCRIPTIONS.VIDEO_ID),
    media: z
      .enum([YOUTUBE_DOWNLOAD_MEDIA.VIDEO, YOUTUBE_DOWNLOAD_MEDIA.AUDIO])
      .default(YOUTUBE_DOWNLOAD_MEDIA.VIDEO)
      .describe(YOUTUBE_DOWNLOAD_FIELD_DESCRIPTIONS.MEDIA),
  });
