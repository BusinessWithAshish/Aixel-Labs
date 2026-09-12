import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeHandleCheckHandler } from "./handler";

export function registerYoutubeHandleCheckRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.HANDLE_CHECK, youtubeHandleCheckHandler);
}
