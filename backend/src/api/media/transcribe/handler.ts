import type { Request, Response } from "express";

import { ALApiResponse } from "../../types";
import { transcribe } from "./client";
import { MEDIA_TRANSCRIBE_ERROR_MESSAGES } from "./constants";
import { MEDIA_TRANSCRIBE_REQUEST_SCHEMA } from "./schemas";
import type { MEDIA_TRANSCRIBE_RESPONSE } from "./types";

/** POST /video/transcribe */
export async function mediaTranscribeHandler(req: Request, res: Response) {
  const parsed = MEDIA_TRANSCRIBE_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: MEDIA_TRANSCRIBE_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await transcribe(parsed.data);
    const response: ALApiResponse<MEDIA_TRANSCRIBE_RESPONSE> = {
      success: true,
      data,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : MEDIA_TRANSCRIBE_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(502).json(response);
  }
}
