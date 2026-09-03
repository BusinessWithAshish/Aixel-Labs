import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeVideoDownloadHandler } from "./handler";

export function registerYoutubeVideoDownloadRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.VIDEO_DOWNLOAD, youtubeVideoDownloadHandler);
}

export { downloadYoutubeMedia, getYoutubeStreamUrls } from "./helpers";
export type { YOUTUBE_STREAM_URLS } from "./helpers";
export { YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA } from "./schemas";
export type {
  YOUTUBE_VIDEO_DOWNLOAD_REQUEST,
  YOUTUBE_VIDEO_DOWNLOAD_RESPONSE,
} from "./types";
