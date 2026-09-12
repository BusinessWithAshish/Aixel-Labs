import type { Request, Response } from "express";

import { statusCodeFromError } from "../../config";
import { ALApiResponse } from "../types";
import { generateGemini, isGeminiBusy, runGeminiHealth } from "./client";
import { GEMINI_ERROR_MESSAGES } from "./constants";
import { GEMINI_REQUEST_SCHEMA } from "./schemas";
import type { GEMINI_HEALTH_RESPONSE, GEMINI_RESPONSE } from "./types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : GEMINI_ERROR_MESSAGES.GENERIC;
}

/** GET /gemini/health */
export async function geminiHealthHandler(_req: Request, res: Response) {
  try {
    const data = await runGeminiHealth();
    res.status(200).json({ success: true, data } satisfies ALApiResponse<GEMINI_HEALTH_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}

/** POST /gemini — one Gemini turn (sync; a video turn can take several minutes). */
export async function geminiGenerateHandler(req: Request, res: Response) {
  const parsed = GEMINI_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: GEMINI_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  if (isGeminiBusy()) {
    res.status(409).json({
      success: false,
      error: GEMINI_ERROR_MESSAGES.BUSY,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await generateGemini(parsed.data);
    res.status(200).json({ success: true, data } satisfies ALApiResponse<GEMINI_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}
