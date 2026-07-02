import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeHandleHandler } from "./handler";

export function registerYoutubeHandleRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.HANDLE, youtubeHandleHandler);
}
