import type { Request, Response } from "express";
import {
  YOUTUBE_PLAYLIST_PARAMS_SCHEMA,
  YOUTUBE_PLAYLIST_QUERY_SCHEMA,
} from "./schemas";
import { fetchYoutubePlaylist, YoutubeDataError } from "./helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_PLAYLIST_RESPONSE } from "./types";

export async function youtubePlaylistHandler(req: Request, res: Response) {
  const parsedParams = YOUTUBE_PLAYLIST_PARAMS_SCHEMA.safeParse(req.params);
  const parsedQuery = YOUTUBE_PLAYLIST_QUERY_SCHEMA.safeParse(req.query);

  if (!parsedParams.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/PLAYLIST] : Invalid playlist ID",
    });
    return;
  }

  if (!parsedQuery.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/PLAYLIST] : Invalid query parameters",
    });
    return;
  }

  try {
    const data = await fetchYoutubePlaylist(
      parsedParams.data.playlistId,
      parsedQuery.data.limit,
    );

    const response: ALApiResponse<YOUTUBE_PLAYLIST_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof YoutubeDataError) {
      console.error("[YOUTUBE/PLAYLIST] Data extraction error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/PLAYLIST] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/PLAYLIST] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/PLAYLIST] : Internal server error",
    });
  }
}
