import { z } from "zod";

export const YOUTUBE_VIDEO_PARAMS_SCHEMA = z.object({
  videoId: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, "Invalid YouTube video ID")
    .describe("YouTube video ID (e.g. dQw4w9WgXcQ)"),
});
