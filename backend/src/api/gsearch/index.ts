import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { gsearchApiHandler } from "./handler";
import { registerGsearchV2Routes } from "./v2";

const gsearchRoutes: IRouter = Router();

gsearchRoutes.post(API_ENDPOINTS.GSEARCH.SEARCH.route, gsearchApiHandler);
registerGsearchV2Routes(gsearchRoutes);

export default gsearchRoutes;

export { fetchGsearch } from "./client";
export { GSEARCH_REQUEST_SCHEMA } from "./schemas";
export {
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_DEFAULT_TIME_FILTER,
  GSEARCH_MAX_PAGES,
  GSEARCH_SAFE,
  GSEARCH_TIME_FILTER,
} from "./constants";
export type {
  GSEARCH_FETCH_RESPONSE,
  GSEARCH_REQUEST,
  GSEARCH_RESPONSE,
  GSEARCH_RESULT,
} from "./types";

export {
  fetchGsearchV2,
  GSEARCH_V2_REQUEST_SCHEMA,
  GSEARCH_V2_BACKEND,
  GSEARCH_V2_ROUTES,
} from "./v2";
export type {
  GSEARCH_V2_FETCH_RESPONSE,
  GSEARCH_V2_KNOWLEDGE_GRAPH,
  GSEARCH_V2_REQUEST,
  GSEARCH_V2_REQUEST_PARSED,
  GSEARCH_V2_RESPONSE,
} from "./v2";
