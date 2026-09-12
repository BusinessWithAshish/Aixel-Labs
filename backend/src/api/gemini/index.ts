import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { geminiGenerateHandler, geminiHealthHandler } from "./handler";

const geminiRoutes: IRouter = Router();

geminiRoutes.get(API_ENDPOINTS.GEMINI.HEALTH.route, geminiHealthHandler);
geminiRoutes.post(API_ENDPOINTS.GEMINI.GENERATE.route, geminiGenerateHandler);

export default geminiRoutes;

export { generateGemini, isGeminiBusy, runGeminiHealth } from "./client";
export { GEMINI_REQUEST_SCHEMA } from "./schemas";
export { GEMINI, GEMINI_ERROR_MESSAGES, GEMINI_ROUTES } from "./constants";
export type {
  GEMINI_HEALTH_RESPONSE,
  GEMINI_MEDIA,
  GEMINI_REQUEST,
  GEMINI_REQUEST_PARSED,
  GEMINI_RESPONSE,
} from "./types";
