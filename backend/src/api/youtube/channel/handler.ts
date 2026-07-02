import type { Request, Response } from "express";
import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "./schemas";
import { fetchYoutubeChannel } from "./helpers";
import { resolveYoutubeHandleToChannelId } from "../handle/helpers";
import type { ALApiResponse } from "../../types";
import type { YOUTUBE_CHANNEL_RESPONSE } from "./types";

export async function youtubeChannelHandler(req: Request, res: Response) {
  const parsed = YOUTUBE_CHANNEL_REQUEST_SCHEMA.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: "[YOUTUBE/CHANNEL] : Invalid request parameters",
    });
    return;
  }

  try {
    const {
      channelId: inputChannelId,
      handle,
      contentType,
      limit,
      country,
      region,
    } = parsed.data;
    const channelId =
      inputChannelId ??
      (await resolveYoutubeHandleToChannelId(handle!, { country, region }));

    const data = await fetchYoutubeChannel({
      channelId,
      contentType,
      limit,
      country,
      region,
    });

    const response: ALApiResponse<YOUTUBE_CHANNEL_RESPONSE> = {
      success: true,
      data,
    };

    res.status(200).json(response);
  } catch (err) {
    if (err instanceof Error) {
      console.error("[YOUTUBE/CHANNEL] Data extraction error:", err.message);
      res.status(502).json({
        success: false,
        error: `[YOUTUBE/CHANNEL] : ${err.message}`,
      });
      return;
    }

    console.error("[YOUTUBE/CHANNEL] Unexpected error:", err);
    res.status(500).json({
      success: false,
      error: "[YOUTUBE/CHANNEL] : Internal server error",
    });
  }
}
