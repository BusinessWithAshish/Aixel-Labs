import type { Request, Response } from "express";
import { YOUTUBE_VIDEO_PARAMS_SCHEMA } from "./schemas";
import { fetchYoutubeVideoDetails, YoutubeDataError } from "./helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "./types";

export async function youtubeVideoHandler(req: Request, res: Response) {
  const parsed = YOUTUBE_VIDEO_PARAMS_SCHEMA.safeParse(req.params);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/VIDEO] : Invalid video ID",
    });
    return;
  }

  try {
    const data = await fetchYoutubeVideoDetails(parsed.data.videoId);

    const response: ALApiResponse<YOUTUBE_VIDEO_DETAILS_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof YoutubeDataError) {
      console.error("[YOUTUBE/VIDEO] Data extraction error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/VIDEO] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/VIDEO] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/VIDEO] : Internal server error",
    });
  }
}
