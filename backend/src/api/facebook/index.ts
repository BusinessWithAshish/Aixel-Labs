import { IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import { facebookApiHandler } from "./handler";

export type { FACEBOOK_RESPONSE, FACEBOOK_REQUEST } from "./types";
export { FACEBOOK_REQUEST_SCHEMA } from "./schemas";
export {
  generateFacebookSearchQuery,
  generateExcludeKeywords,
  generateAdvanceQuery,
  extractPageVanity,
  mapFacebookPageHtml,
} from "./helpers";

const facebookRoutes: IRouter = Router();

facebookRoutes.post(API_ENDPOINTS.FACEBOOK.API.route, facebookApiHandler);

export default facebookRoutes;
