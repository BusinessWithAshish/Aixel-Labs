import type { Request, Response } from "express";

import { statusCodeFromError } from "../../config";
import { ALApiResponse } from "../types";
import { budgetStatus } from "./budget";
import { askClaude } from "./client";
import { CLAUDE_ERROR_MESSAGES } from "./constants";
import { CLAUDE_ASK_REQUEST_SCHEMA } from "./schemas";
import type { CLAUDE_ASK_RESPONSE, CLAUDE_BUDGET_STATUS_RESPONSE } from "./types";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : CLAUDE_ERROR_MESSAGES.DELEGATION_FAILED;
}

/** POST /claude — delegate a task; may run several minutes on a cold session. */
export async function claudeAskHandler(req: Request, res: Response) {
  const parsed = CLAUDE_ASK_REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: CLAUDE_ERROR_MESSAGES.INVALID_PARAMS,
    } satisfies ALApiResponse<never>);
    return;
  }

  try {
    const data = await askClaude(parsed.data);
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<CLAUDE_ASK_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}

/** GET /claude/budget — daily delegation budget status. */
export async function claudeBudgetHandler(_req: Request, res: Response) {
  try {
    const data = budgetStatus();
    res.status(200).json({
      success: true,
      data,
    } satisfies ALApiResponse<CLAUDE_BUDGET_STATUS_RESPONSE>);
  } catch (err) {
    res.status(statusCodeFromError(err)).json({
      success: false,
      error: errorMessage(err),
    } satisfies ALApiResponse<never>);
  }
}
