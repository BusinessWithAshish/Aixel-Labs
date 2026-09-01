import type { Request, Response } from "express";

import { statusCodeFromError } from "../../config";
import { ALApiResponse } from "../types";
import {
  generateChatGpt,
  isChatGptBusy,
  runChatGptHealth,
  stageChatGptReferenceImage,
} from "./client";
import { CHATGPT_ERROR_MESSAGES } from "./constants";
import { CHATGPT_REQUEST_SCHEMA, CHATGPT_STAGE_REQUEST_SCHEMA } from "./schemas";
import type {
  CHATGPT_HEALTH_RESPONSE,
  CHATGPT_RESPONSE,
  CHATGPT_STAGE_RESPONSE,
} from "./types";

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : CHATGPT_ERROR_MESSAGES.GENERIC;
}

/** GET /chatgpt/health */
export async function chatgptHealthHandler(_req: Request, res: Response) {
  try {
    const data = await runChatGptHealth();
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<CHATGPT_HEALTH_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}

/** POST /chatgpt — sync generate; may run many minutes. */
export async function chatgptGenerateHandler(req: Request, res: Response) {
  const parsed = CHATGPT_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: CHATGPT_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  if (isChatGptBusy()) {
    res.status(409).json({
      success: false,
      error: CHATGPT_ERROR_MESSAGES.BUSY,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await generateChatGpt(parsed.data);
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<CHATGPT_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}

/** POST /chatgpt/stage — download a URL to a local file for later use as a reference image. */
export async function chatgptStageHandler(req: Request, res: Response) {
  const parsed = CHATGPT_STAGE_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: CHATGPT_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await stageChatGptReferenceImage(parsed.data);
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<CHATGPT_STAGE_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}
