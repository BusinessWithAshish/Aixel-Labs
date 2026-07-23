import { IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import { instagramApiHandler } from "./handler";
import advancedRoutes from "./advanced";
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

const instagramRoutes: IRouter = Router();

instagramRoutes.post(API_ENDPOINTS.INSTAGRAM.API.route, instagramApiHandler);
instagramRoutes.use(advancedRoutes);

export default instagramRoutes;
