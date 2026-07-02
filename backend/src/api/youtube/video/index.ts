import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import {
  youtubeVideoHandler,
  youtubeVideoSuggestedVideosHandler,
} from "./handler";

export function registerYoutubeVideoRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.VIDEO, youtubeVideoHandler);
  router.post(
    YOUTUBE_API_ROUTES.VIDEO_SUGGESTED,
    youtubeVideoSuggestedVideosHandler,
  );
}
