import { z } from "zod";
import {
  YOUTUBE_PLAYLIST_PARAMS_SCHEMA,
  YOUTUBE_PLAYLIST_QUERY_SCHEMA,
} from "./schemas";
import type { YT_SEARCH_ITEM } from "../types";

export type YOUTUBE_PLAYLIST_PARAMS = z.infer<
  typeof YOUTUBE_PLAYLIST_PARAMS_SCHEMA
>;

export type YOUTUBE_PLAYLIST_QUERY = z.infer<
  typeof YOUTUBE_PLAYLIST_QUERY_SCHEMA
>;

export type YOUTUBE_PLAYLIST_RESPONSE = {
  playlistId: string;
  metadata: unknown;
  items: YT_SEARCH_ITEM[];
};
