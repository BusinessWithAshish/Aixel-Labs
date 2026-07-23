import { z } from "zod";
import type { INSTAGRAM_RESPONSE } from "../../types";
import type { IgContentKind } from "./constants";
import { IG_ADVANCED_SEARCH_REQUEST_SCHEMA } from "./schemas";

export type IG_ADVANCED_SEARCH_REQUEST = z.infer<
  typeof IG_ADVANCED_SEARCH_REQUEST_SCHEMA
>;

export type IG_ADVANCED_CONTENT_HIT = {
  kind: IgContentKind | "other";
  url: string;
  shortcode: string | null;
  username: string | null;
  likeCount: number | null;
  commentCount: number | null;
  titleSnippet: string | null;
  resolveMethod: string | null;
};

export type IG_ADVANCED_SEARCH_RESPONSE = {
  query: string;
  kinds: IgContentKind[];
  /** Classified + resolved content hits (posts/reels). */
  contents: IG_ADVANCED_CONTENT_HIT[];
  /** Unique handles discovered from content. */
  usernames: string[];
  /** Optional enriched profile leads. */
  leads: INSTAGRAM_RESPONSE[];
  meta: {
    gsearchRows: number;
    resolved: number;
    uniqueHandles: number;
  };
};
