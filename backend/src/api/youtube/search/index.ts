import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { youtubeSearchHandler } from "./handler";

export function registerYoutubeSearchRoutes(router: IRouter) {
  router.post(API_ENDPOINTS.YOUTUBE.SEARCH.route, youtubeSearchHandler);
}
