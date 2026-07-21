import type { IRouter } from "express";
import { YOUTUBE_API_ROUTES } from "../constants";
import { youtubeSuggestHandler } from "./handler";

export function registerYoutubeSuggestRoutes(router: IRouter) {
  router.post(YOUTUBE_API_ROUTES.SUGGEST, youtubeSuggestHandler);
}

export { fetchYoutubeSuggest, mapSuggestItems, parseSuggestJsonp } from "./helpers";
export type {
  YOUTUBE_SUGGEST_ITEM,
  YOUTUBE_SUGGEST_REQUEST,
  YOUTUBE_SUGGEST_RESPONSE,
} from "./types";
