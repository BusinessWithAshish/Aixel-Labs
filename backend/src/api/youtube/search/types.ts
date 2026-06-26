import { z } from "zod";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "./schemas";
import type { YT_NEXT_PAGE, YT_SEARCH_ITEM } from "../types";

export type YOUTUBE_SEARCH_REQUEST = z.infer<
  typeof YOUTUBE_SEARCH_REQUEST_SCHEMA
>;

export type YOUTUBE_SEARCH_RESPONSE = {
  items: YT_SEARCH_ITEM[];
  nextPage: YT_NEXT_PAGE;
};
