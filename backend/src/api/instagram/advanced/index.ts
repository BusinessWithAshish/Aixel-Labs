import { IRouter, Router } from "express";
import { IG_ADVANCED_ROUTES } from "./constants";
import { instagramAdvancedPostsHandler } from "./handler";
import { instagramAdvancedSearchHandler } from "./search";

export type {
  IG_ADVANCED_POST,
  IG_ADVANCED_POSTS_REQUEST,
  IG_ADVANCED_POSTS_RESPONSE,
} from "./types";
export { IG_ADVANCED_POSTS_REQUEST_SCHEMA } from "./schemas";
export { fetchInstagramAdvancedPosts } from "./client";
export { IG_ADVANCED_ROUTES } from "./constants";
export {
  fetchInstagramAdvancedSearch,
  IG_ADVANCED_SEARCH_REQUEST_SCHEMA,
} from "./search";
export type {
  IG_ADVANCED_CONTENT_HIT,
  IG_ADVANCED_SEARCH_REQUEST,
  IG_ADVANCED_SEARCH_RESPONSE,
} from "./search";

const advancedRoutes: IRouter = Router();

advancedRoutes.post(IG_ADVANCED_ROUTES.POSTS, instagramAdvancedPostsHandler);
advancedRoutes.post(IG_ADVANCED_ROUTES.SEARCH, instagramAdvancedSearchHandler);

export default advancedRoutes;
