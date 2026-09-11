/**
 * Instagram router — mounts the base `/instagram` POST handler, the
 * `/instagram/advanced/*` sub-routes, `/instagram/download`, and the
 * intelligence routes.
 */
import { IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import { instagramApiHandler } from "./handler";
import advancedRoutes from "./advanced";
import downloadRoutes from "./download";
import { registerInstagramIntelligenceRoutes } from "./intelligence";
export type { INSTAGRAM_RESPONSE } from "./types";
export { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
export {
  generateInstagramSearchQuery,
  generateExcludeKeywords,
  generateAdvanceQuery,
} from "./helpers";
export type {
  IG_ADVANCED_POST,
  IG_ADVANCED_POSTS_REQUEST,
  IG_ADVANCED_POSTS_RESPONSE,
} from "./advanced";
export { IG_ADVANCED_POSTS_REQUEST_SCHEMA } from "./advanced";
export type {
  IG_DOWNLOAD_ITEM,
  IG_DOWNLOAD_POST,
  IG_DOWNLOAD_REQUEST,
  IG_DOWNLOAD_RESPONSE,
} from "./download";
export { IG_DOWNLOAD_REQUEST_SCHEMA } from "./download";

const instagramRoutes: IRouter = Router();

instagramRoutes.post(API_ENDPOINTS.INSTAGRAM.API.route, instagramApiHandler);
instagramRoutes.use(advancedRoutes);
instagramRoutes.use(downloadRoutes);
registerInstagramIntelligenceRoutes(instagramRoutes);

export default instagramRoutes;
