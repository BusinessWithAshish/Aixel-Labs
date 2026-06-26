import type { Request, Response } from "express";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeSearch, YoutubeDataError } from "./helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_SEARCH_RESPONSE } from "./types";

export async function youtubeSearchHandler(req: Request, res: Response) {
  const parsed = YOUTUBE_SEARCH_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/SEARCH] : Invalid request parameters",
    });
    return;
  }

  try {
    const data = await fetchYoutubeSearch(parsed.data);

    const response: ALApiResponse<YOUTUBE_SEARCH_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof YoutubeDataError) {
      console.error("[YOUTUBE/SEARCH] Data extraction error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/SEARCH] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/SEARCH] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/SEARCH] : Internal server error",
    });
  }
}
