import type { IRouter } from "express";
import { API_ENDPOINTS } from "../../../config";
import { youtubePlaylistHandler } from "./handler";

export function registerYoutubePlaylistRoutes(router: IRouter) {
  router.get(API_ENDPOINTS.YOUTUBE.PLAYLIST.route, youtubePlaylistHandler);
}
