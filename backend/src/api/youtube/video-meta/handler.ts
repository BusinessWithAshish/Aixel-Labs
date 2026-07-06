import type { Request, Response } from "express";
import { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeVideoMeta } from "./helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_VIDEO_META_RESPONSE } from "./types";

export async function youtubeVideoMetaHandler(req: Request, res: Response) {
  const parsed = YOUTUBE_VIDEO_META_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/VIDEO-META] : Invalid request parameters",
    });
    return;
  }

  try {
    const data = await fetchYoutubeVideoMeta(parsed.data);

    const response: ALApiResponse<YOUTUBE_VIDEO_META_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof Error) {
      console.error("[YOUTUBE/VIDEO-META] Error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/VIDEO-META] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/VIDEO-META] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/VIDEO-META] : Internal server error",
    });
  }
}
