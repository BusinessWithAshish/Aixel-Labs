import { z } from "zod";
import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_ID_SCHEMA,
  youtubeLimitSchema,
} from "../schemas";

export const YOUTUBE_VIDEO_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  videoId: YOUTUBE_VIDEO_ID_SCHEMA,
});

export const YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA =
  YOUTUBE_VIDEO_REQUEST_SCHEMA.extend({
    limit: youtubeLimitSchema("Maximum number of suggested videos to return"),
  });
