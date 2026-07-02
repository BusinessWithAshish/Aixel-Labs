import { z } from "zod";
import { YOUTUBE_DEFAULT_LIMIT, YOUTUBE_MAX_LIMIT } from "../constants";
import {
  YOUTUBE_CHANNEL_ID_SCHEMA,
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_HANDLE_VALUE_SCHEMA,
} from "../schemas";
import { YT_CHANNEL_CONTENT_TYPE } from "./constants";

export const YOUTUBE_CHANNEL_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend(
  {
    channelId: YOUTUBE_CHANNEL_ID_SCHEMA.optional(),
    handle: YOUTUBE_HANDLE_VALUE_SCHEMA.optional().describe(
      "YouTube channel handle (@username or username)",
    ),
    contentType: z
      .nativeEnum(YT_CHANNEL_CONTENT_TYPE)
      .default(YT_CHANNEL_CONTENT_TYPE.VIDEOS)
      .optional()
      .describe(
        "Channel content tab to fetch (videos, shorts, playlists). Defaults to videos.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(YOUTUBE_MAX_LIMIT)
      .default(YOUTUBE_DEFAULT_LIMIT)
      .optional()
      .describe(
        `Maximum number of items to return (default ${YOUTUBE_DEFAULT_LIMIT}, max ${YOUTUBE_MAX_LIMIT})`,
      ),
  },
).superRefine((data, ctx) => {
  if (!data.channelId && !data.handle) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either channelId or handle is required",
      path: ["channelId"],
    });
  }

  if (data.channelId && data.handle) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide either channelId or handle, not both",
      path: ["channelId"],
    });
  }
});
