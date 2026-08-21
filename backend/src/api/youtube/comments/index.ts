import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeVideoCommentsHandler } from "./handler";

export function registerYoutubeVideoCommentsRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.VIDEO_COMMENTS, youtubeVideoCommentsHandler);
}

export { fetchYoutubeVideoComments } from "./helpers";
export { YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA } from "./schemas";
export type {
  YOUTUBE_COMMENT,
  YOUTUBE_COMMENT_AUTHOR,
  YOUTUBE_COMMENTS_SORT_VALUE,
  YOUTUBE_VIDEO_COMMENTS_REQUEST,
  YOUTUBE_VIDEO_COMMENTS_RESPONSE,
} from "./types";
