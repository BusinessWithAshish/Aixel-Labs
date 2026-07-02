import type { Request, Response } from "express";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeHandle } from "./helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_HANDLE_RESPONSE } from "./types";

export async function youtubeHandleHandler(req: Request, res: Response) {
  const parsed = YOUTUBE_HANDLE_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/HANDLE] : Invalid request parameters",
    });
    return;
  }

  try {
    const data = await fetchYoutubeHandle(parsed.data);

    const response: ALApiResponse<YOUTUBE_HANDLE_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof Error) {
      console.error("[YOUTUBE/HANDLE] Resolution error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/HANDLE] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/HANDLE] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/HANDLE] : Internal server error",
    });
  }
}
