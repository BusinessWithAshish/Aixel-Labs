import type { IRouter } from "express";

import { API_ENDPOINTS } from "../../../config";
import { gsearchV2ApiHandler } from "./handler";

export function registerGsearchV2Routes(router: IRouter): void {
  router.post(API_ENDPOINTS.GSEARCH.SEARCH_V2.route, gsearchV2ApiHandler);
}

export { fetchGsearchV2 } from "./client";
export { GSEARCH_V2_REQUEST_SCHEMA } from "./schemas";
export {
  GSEARCH_V2_BACKEND,
  GSEARCH_V2_HANDLER_LABELS,
  GSEARCH_V2_ROUTES,
} from "./constants";
export type {
  GSEARCH_V2_FETCH_RESPONSE,
  GSEARCH_V2_KNOWLEDGE_GRAPH,
  GSEARCH_V2_REQUEST,
  GSEARCH_V2_REQUEST_PARSED,
  GSEARCH_V2_RESPONSE,
} from "./types";
