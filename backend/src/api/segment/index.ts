import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { segmentBySpeechHandler } from "./handler";

const segmentRoutes: IRouter = Router();

segmentRoutes.post(API_ENDPOINTS.SEGMENT.BY_SPEECH.route, segmentBySpeechHandler);

export default segmentRoutes;

/* Services — the same functions the MCP `segment` tool calls (no HTTP loopback). */
export { rankBySpeech } from "./by-speech/rank";
export { scoreViralMoments } from "./moments/score";
export { scoreViralMomentsWithClaude } from "./moments/score-claude";

export { BY_SPEECH_REQUEST_SCHEMA } from "./by-speech/schemas";

export {
  SEGMENT_ERROR_MESSAGES,
  SEGMENT_PROVIDERS,
} from "./constants";

export type { SEGMENT_PROVIDER } from "./constants";

export type {
  BY_SPEECH_REQUEST,
  BY_SPEECH_REQUEST_PARSED,
  BY_SPEECH_RESPONSE,
  SEGMENT_USAGE,
} from "./types";

export type {
  MOMENTS_HOOK_TYPE,
  MOMENTS_PODCAST_TONE,
  VIRAL_MOMENT_CANDIDATE,
} from "./moments/types";
