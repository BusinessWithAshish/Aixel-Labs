import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeSearchHandler } from "./handler";

export function registerYoutubeSearchRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.SEARCH, youtubeSearchHandler);
}
