import { z } from "zod";
import {
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_ID_SCHEMA,
} from "../schemas";
import {
  YOUTUBE_COMMENTS_DEFAULT_LIMIT,
  YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS,
  YOUTUBE_COMMENTS_MAX_LIMIT,
  YOUTUBE_COMMENTS_SORT,
} from "./constants";

export const YOUTUBE_COMMENTS_SORT_SCHEMA = z
  .enum([YOUTUBE_COMMENTS_SORT.TOP, YOUTUBE_COMMENTS_SORT.NEWEST])
  .default(YOUTUBE_COMMENTS_SORT.TOP)
  .describe(YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS.SORT);

export const YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA =
  YOUTUBE_GEO_REQUEST_SCHEMA.extend({
    videoId: YOUTUBE_VIDEO_ID_SCHEMA.describe(
      YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS.VIDEO_ID,
    ),
    sort: YOUTUBE_COMMENTS_SORT_SCHEMA,
    limit: z
      .number()
      .int()
      .min(1)
      .max(YOUTUBE_COMMENTS_MAX_LIMIT)
      .default(YOUTUBE_COMMENTS_DEFAULT_LIMIT)
      .optional()
      .describe(YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS.LIMIT),
    continuation: z
      .string()
      .trim()
      .min(1)
      .max(8000)
      .optional()
      .describe(YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS.CONTINUATION),
  });
