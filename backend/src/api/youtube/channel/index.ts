import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeChannelHandler } from "./handler";

export function registerYoutubeChannelRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.CHANNEL, youtubeChannelHandler);
}
