import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { gsearchApiHandler } from "./handler";

const gsearchRoutes: IRouter = Router();

gsearchRoutes.post(API_ENDPOINTS.GSEARCH.SEARCH.route, gsearchApiHandler);

export default gsearchRoutes;

export { fetchGsearch } from "./client";
export { GSEARCH_REQUEST_SCHEMA } from "./schemas";
export type {
  GSEARCH_REQUEST,
  GSEARCH_RESPONSE,
  GSEARCH_RESULT,
} from "./types";
