import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeDiarizeHandler } from "./handler";

export function registerYoutubeDiarizeRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.DIARIZE, youtubeDiarizeHandler);
}

export { diarizeFromYoutubeCaptions, youtubeCaptionsToDiarizedTranscript } from "./captions";
export { YOUTUBE_DIARIZE_REQUEST_SCHEMA } from "./schemas";
export type { YOUTUBE_DIARIZE_RESPONSE } from "./types";
