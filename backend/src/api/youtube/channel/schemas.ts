import { z } from "zod";
import {
  YOUTUBE_CHANNEL_ID_SCHEMA,
  YOUTUBE_GEO_REQUEST_SCHEMA,
  YOUTUBE_HANDLE_VALUE_SCHEMA,
  youtubeLimitSchema,
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
    limit: youtubeLimitSchema("Maximum number of items to return"),
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
