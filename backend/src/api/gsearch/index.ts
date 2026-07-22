import { type IRouter, Router } from "express";

import { API_ENDPOINTS } from "../../config";
import { gsearchApiHandler } from "./handler";

const gsearchRoutes: IRouter = Router();

gsearchRoutes.post(API_ENDPOINTS.GSEARCH.SEARCH.route, gsearchApiHandler);

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
