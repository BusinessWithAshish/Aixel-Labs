import { z } from "zod";
import type { INSTAGRAM_RESPONSE } from "../../types";
import { IG_POPULAR_REQUEST_SCHEMA } from "./schemas";

export type IG_POPULAR_REQUEST = z.infer<typeof IG_POPULAR_REQUEST_SCHEMA>;

export type IG_POPULAR_REEL_HIT = {
  username: string;
  shortcode: string;
  reelUrl: string;
  viewsText: string | null;
  captionSnippet: string | null;
};

export type IG_POPULAR_RESPONSE = {
  query: string;
  pageUrl: string;
  reels: IG_POPULAR_REEL_HIT[];
  usernames: string[];
  relatedQueries: string[];
  leads: INSTAGRAM_RESPONSE[];
  meta: {
    reelCount: number;
    uniqueHandles: number;
  };
};
