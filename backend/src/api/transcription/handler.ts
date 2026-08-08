import type { Request, Response } from "express";

import { ALApiResponse } from "../types";
import { transcribe } from "./client";
import { TRANSCRIPTION_ERROR_MESSAGES } from "./constants";
import { TRANSCRIPTION_REQUEST_SCHEMA } from "./schemas";
import type { TRANSCRIPTION_RESPONSE } from "./types";

/** POST /transcription */
export async function transcriptionApiHandler(req: Request, res: Response) {
  const parsed = TRANSCRIPTION_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: TRANSCRIPTION_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await transcribe(parsed.data);
    const response: ALApiResponse<TRANSCRIPTION_RESPONSE> = {
      success: true,
      data,
    };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : TRANSCRIPTION_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = {
      success: false,
      error: msg,
    };
    res.status(502).json(response);
  }
}
