import { IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import { instagramApiHandler } from "./handler";
export type { INSTAGRAM_RESPONSE } from "./types";
export { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
export {
  generateInstagramSearchQuery,
  generateExcludeKeywords,
  generateAdvanceQuery,
} from "./helpers";

const instagramRoutes: IRouter = Router();

instagramRoutes.post(API_ENDPOINTS.INSTAGRAM.API.route, instagramApiHandler);

export default instagramRoutes;
