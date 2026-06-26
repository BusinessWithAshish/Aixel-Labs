import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { youtubeVideoHandler } from "./handler";

export function registerYoutubeVideoRoutes(router: IRouter) {
  router.get(API_ENDPOINTS.YOUTUBE.VIDEO.route, youtubeVideoHandler);
}
