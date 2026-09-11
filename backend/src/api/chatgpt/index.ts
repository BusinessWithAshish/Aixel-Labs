import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { chatgptGenerateHandler, chatgptHealthHandler } from "./handler";

const chatgptRoutes: IRouter = Router();

chatgptRoutes.get(
  API_ENDPOINTS.CHATGPT.HEALTH.route,
  chatgptHealthHandler,
);

chatgptRoutes.post(
  API_ENDPOINTS.CHATGPT.GENERATE.route,
  chatgptGenerateHandler,
);

export default chatgptRoutes;

export { generateChatGpt, runChatGptHealth } from "./client";
export { CHATGPT_REQUEST_SCHEMA } from "./schemas";
export {
  CHATGPT,
  CHATGPT_ERROR_MESSAGES,
  CHATGPT_ROUTES,
} from "./constants";
export type {
  CHATGPT_HEALTH_RESPONSE,
  CHATGPT_REQUEST,
  CHATGPT_REQUEST_PARSED,
  CHATGPT_RESPONSE,
} from "./types";
