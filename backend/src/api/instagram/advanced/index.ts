import { IRouter, Router } from "express";
import { IG_ADVANCED_ROUTES } from "./constants";
import { instagramAdvancedPostsHandler } from "./handler";
import { instagramAdvancedSearchHandler } from "./search";
import { instagramPopularSearchHandler } from "./popular";

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
export {
  fetchInstagramPopularSearch,
  IG_POPULAR_REQUEST_SCHEMA,
} from "./popular";
export type {
  IG_POPULAR_REEL_HIT,
  IG_POPULAR_REQUEST,
  IG_POPULAR_RESPONSE,
} from "./popular";

const advancedRoutes: IRouter = Router();

advancedRoutes.post(IG_ADVANCED_ROUTES.POSTS, instagramAdvancedPostsHandler);
advancedRoutes.post(IG_ADVANCED_ROUTES.SEARCH, instagramAdvancedSearchHandler);
advancedRoutes.post(IG_ADVANCED_ROUTES.POPULAR, instagramPopularSearchHandler);

export default advancedRoutes;
