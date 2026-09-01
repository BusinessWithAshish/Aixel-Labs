import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { claudeAskHandler, claudeBudgetHandler } from "./handler";

const claudeRoutes: IRouter = Router();

claudeRoutes.post(API_ENDPOINTS.CLAUDE.ASK.route, claudeAskHandler);
claudeRoutes.get(API_ENDPOINTS.CLAUDE.BUDGET.route, claudeBudgetHandler);

export default claudeRoutes;

export { askClaude } from "./client";
export { budgetStatus, checkBudget, recordBudget } from "./budget";
export { CLAUDE_ASK_REQUEST_SCHEMA, CLAUDE_BUDGET_STATUS_REQUEST_SCHEMA } from "./schemas";
export { CLAUDE_ASK, CLAUDE_BUDGET, CLAUDE_ERROR_MESSAGES } from "./constants";
export type {
  CLAUDE_ASK_REQUEST,
  CLAUDE_ASK_REQUEST_PARSED,
  CLAUDE_ASK_RESPONSE,
  CLAUDE_BUDGET_STATUS_RESPONSE,
  CLAUDE_USAGE,
} from "./types";
