import type { Request, Response } from "express";

import { ALApiResponse } from "../types";
import { tightenVideo } from "./client";
import { TIGHTENING_ERROR_MESSAGES } from "./constants";
import { TIGHTENING_REQUEST_SCHEMA } from "./schemas";
import type { TIGHTENING_RESPONSE } from "./types";

/** POST /tightening */
export async function tighteningApiHandler(req: Request, res: Response) {
  const parsed = TIGHTENING_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: TIGHTENING_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await tightenVideo(parsed.data);
    const response: ALApiResponse<TIGHTENING_RESPONSE> = { success: true, data };
    res.status(200).json(response);
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : TIGHTENING_ERROR_MESSAGES.GENERIC;
    const response: ALApiResponse<never> = { success: false, error: msg };
    res.status(502).json(response);
  }
}
