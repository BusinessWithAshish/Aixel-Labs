import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeVideoTranscriptHandler } from "./handler";

export function registerYoutubeVideoTranscriptRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.VIDEO_TRANSCRIPT, youtubeVideoTranscriptHandler);
}

export { fetchYoutubeVideoTranscript } from "./helpers";
export type {
  YOUTUBE_TRANSCRIPT_LINE,
  YOUTUBE_TRANSCRIPT_TRACK,
  YOUTUBE_VIDEO_TRANSCRIPT_REQUEST,
  YOUTUBE_VIDEO_TRANSCRIPT_RESPONSE,
} from "./types";
