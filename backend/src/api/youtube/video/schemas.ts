import { z } from "zod";
import { YOUTUBE_DEFAULT_LIMIT, YOUTUBE_MAX_LIMIT } from "../constants";
import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_ID_SCHEMA,
} from "../schemas";

export const YOUTUBE_VIDEO_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  videoId: YOUTUBE_VIDEO_ID_SCHEMA,
});

export const YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA =
  YOUTUBE_VIDEO_REQUEST_SCHEMA.extend({
    limit: z
      .number()
      .int()
      .min(1)
      .max(YOUTUBE_MAX_LIMIT)
      .default(YOUTUBE_DEFAULT_LIMIT)
      .optional()
      .describe(
        `Maximum number of suggested videos to return (default ${YOUTUBE_DEFAULT_LIMIT}, max ${YOUTUBE_MAX_LIMIT})`,
      ),
  });
