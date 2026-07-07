import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeVideoMetaHandler } from "./handler";

export function registerYoutubeVideoMetaRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.VIDEO_META, youtubeVideoMetaHandler);
}

export {
  fetchPublishedAtByVideoIds,
  fetchVideoWatchMetaByVideoIds,
  fetchYoutubeVideoMeta,
  videoMetaItemsToPublishedAtMap,
  videoMetaItemsToWatchMetaMap,
} from "./helpers";
export type {
  YOUTUBE_VIDEO_META_ITEM,
  YOUTUBE_VIDEO_META_REQUEST,
  YOUTUBE_VIDEO_META_RESPONSE,
} from "./types";
export type { YOUTUBE_VIDEO_WATCH_META } from "../types";
