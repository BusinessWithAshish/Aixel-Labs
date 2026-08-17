import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { tighteningApiHandler } from "./handler";

const tighteningRoutes: IRouter = Router();

tighteningRoutes.post(API_ENDPOINTS.TIGHTENING.TIGHTEN.route, tighteningApiHandler);

export default tighteningRoutes;

export { tightenVideo } from "./client";
export { TIGHTENING_REQUEST_SCHEMA } from "./schemas";
export {
  TIGHTENING,
  TIGHTENING_DEFAULT_FILLER_WORDS,
  TIGHTENING_ERROR_MESSAGES,
} from "./constants";
export { detectSilences } from "./silence";
export { findFillerRanges } from "./fillers";
export {
  capRanges,
  invertToKeepRanges,
  mergeRanges,
  shrinkSilences,
  totalDuration,
} from "./ranges";
export { assembleKeepRanges } from "./assemble";
export type {
  TIGHTENING_REQUEST,
  TIGHTENING_REQUEST_PARSED,
  TIGHTENING_RESPONSE,
  TIME_RANGE,
} from "./types";
