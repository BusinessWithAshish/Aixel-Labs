import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { chatgptGenerateHandler, chatgptHealthHandler, chatgptImageHandler } from "./handler";

const chatgptRoutes: IRouter = Router();

chatgptRoutes.get(
  API_ENDPOINTS.CHATGPT.HEALTH.route,
  chatgptHealthHandler,
);

chatgptRoutes.post(
  API_ENDPOINTS.CHATGPT.GENERATE.route,
  chatgptGenerateHandler,
);

chatgptRoutes.post(
  API_ENDPOINTS.CHATGPT.IMAGE.route,
  chatgptImageHandler,
);

export default chatgptRoutes;

export { generateChatGpt, runChatGptHealth } from "./client";
export { generateCodexImage } from "./codex";
export { CHATGPT_CODEX_IMAGE_REQUEST_SCHEMA, CHATGPT_REQUEST_SCHEMA } from "./schemas";
export {
  CHATGPT,
  CHATGPT_ERROR_MESSAGES,
  CHATGPT_ROUTES,
} from "./constants";
export type {
  CHATGPT_CODEX_IMAGE_REQUEST,
  CHATGPT_CODEX_IMAGE_REQUEST_PARSED,
  CHATGPT_CODEX_IMAGE_RESPONSE,
  CHATGPT_HEALTH_RESPONSE,
  CHATGPT_REQUEST,
  CHATGPT_REQUEST_PARSED,
  CHATGPT_RESPONSE,
} from "./types";
