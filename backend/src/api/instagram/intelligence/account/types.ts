import type { z } from "zod";
import type { IG_ADVANCED_POST } from "../../advanced/types";
import type {
  INSTAGRAM_POST_INTELLIGENCE_FIELDS,
  WithIntelligence,
} from "../types";
import type { INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA } from "./schemas";

export type InstagramAccountIntelligenceInput = z.infer<
  typeof INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA
>;

/** Deliberately excludes `images[]`/`videos[]`/`carousel[]`/`coauthors[]` —
 * those CDN-rendition arrays are what pushed a single instagram_get_posts
 * page past MCP response size limits during skill research. Keep exactly
 * one direct URL per post instead of every rendition. */
export type INSTAGRAM_POST_LEAN_FIELDS = Pick<
  IG_ADVANCED_POST,
  | "id"
  | "shortcode"
  | "url"
  | "caption"
  | "mediaType"
  | "mediaTypeLabel"
  | "productType"
  | "isVideo"
  | "takenAt"
  | "likeCount"
  | "commentCount"
  | "playCount"
  | "viewCount"
  | "videoUrl"
  | "imageUrl"
>;

export type INSTAGRAM_POST_ITEM_INTELLIGENCE = WithIntelligence<
  INSTAGRAM_POST_LEAN_FIELDS,
  INSTAGRAM_POST_INTELLIGENCE_FIELDS
>;

export type INSTAGRAM_ACCOUNT_INTELLIGENCE_RESPONSE = {
  username: string;
  followers: number | null;
  isPrivate: boolean | null;
  isBusiness: boolean | null;
  posts: INSTAGRAM_POST_ITEM_INTELLIGENCE[];
};
