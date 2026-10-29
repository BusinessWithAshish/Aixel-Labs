import type { z } from "zod";
import type { CONTENT_LAB_FORMATS, CONTENT_LAB_PLATFORMS } from "./constants";
import type {
  CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA,
  CONTENT_LAB_CHECK_REQUEST_SCHEMA,
  CONTENT_LAB_CREATOR_REQUEST_SCHEMA,
  CONTENT_LAB_EXPLORE_REQUEST_SCHEMA,
  CONTENT_LAB_SUGGEST_REQUEST_SCHEMA,
} from "./schemas";

export type ContentLabPlatform = (typeof CONTENT_LAB_PLATFORMS)[number];
export type ContentLabFormat = (typeof CONTENT_LAB_FORMATS)[number];

export type CONTENT_LAB_EXPLORE_REQUEST = z.input<typeof CONTENT_LAB_EXPLORE_REQUEST_SCHEMA>;
export type CONTENT_LAB_BREAKDOWN_REQUEST = z.input<typeof CONTENT_LAB_BREAKDOWN_REQUEST_SCHEMA>;
export type CONTENT_LAB_CHECK_REQUEST = z.input<typeof CONTENT_LAB_CHECK_REQUEST_SCHEMA>;
export type CONTENT_LAB_CREATOR_REQUEST = z.input<typeof CONTENT_LAB_CREATOR_REQUEST_SCHEMA>;

/** What a title / first caption line does, used for "why it worked" and for checks. */
export type CONTENT_LAB_TEXT_SIGNALS = {
  hasNumber: boolean;
  /** ₹ / $ / "rs" / "under 50" style price or budget. */
  hasPrice: boolean;
  hasQuestion: boolean;
  hasYear: boolean;
  /** "7 ways", "top 10", "3 breakfasts". */
  isListicle: boolean;
  /** "POV:" framing. */
  hasPov: boolean;
  /** "I tried", "30 days", "I tested": a challenge or experiment. */
  isChallenge: boolean;
  /** Characters. */
  length: number;
};

export type CONTENT_LAB_CREATOR = {
  platform: ContentLabPlatform;
  /** Channel id (YouTube) or username (Instagram). */
  id: string;
  handle: string | null;
  name: string | null;
  url: string | null;
  followers: number | null;
  /** Profile picture; filled by the creator route (explore may leave it out). */
  avatarUrl?: string | null;
  /** Channel description / Instagram bio; filled by the creator route. */
  bio?: string | null;
};

export type CONTENT_LAB_POST = {
  /** `${platform}:${nativeId}`: stable, safe to store. */
  id: string;
  platform: ContentLabPlatform;
  format: ContentLabFormat;
  url: string;
  /** Video title, or the first line of the caption. */
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  /** Views (YouTube) / plays (reels) / null when the platform hides them (photo posts). */
  views: number | null;
  likes: number | null;
  comments: number | null;
  durationSeconds: number | null;
  creator: CONTENT_LAB_CREATOR;
  /** The creator's median views (likes for photo posts) over recent posts of the same format family. */
  usualViews: number | null;
  /** views ÷ usualViews; null when the baseline is too thin to trust. */
  multiple: number | null;
  /** Plain-language reasons, e.g. "₹ price in the title". */
  reasons: string[];
  signals: CONTENT_LAB_TEXT_SIGNALS;
};

export type CONTENT_LAB_TAKEAWAY = {
  /** Short headline, e.g. "5 of 6". */
  headline: string;
  detail: string;
};

export type CONTENT_LAB_EXPLORE_RESPONSE = {
  query: string;
  country: string;
  platforms: ContentLabPlatform[];
  /**
   * Best first: a blend of how far each post beat its creator's usual, its
   * views and how recent it is; posts with tiny view counts last. Never repeats
   * a post returned on an earlier page of the same search.
   */
  posts: CONTENT_LAB_POST[];
  /** Page 1 only; later pages return []. */
  takeaways: CONTENT_LAB_TAKEAWAY[];
  niche: {
    postCount: number;
    outlierCount: number;
    medianMultiple: number | null;
    bestFormat: Partial<Record<ContentLabPlatform, ContentLabFormat>>;
  };
  /** Per-platform failures (e.g. Instagram blocked); the other platform's posts still return. */
  errors: Partial<Record<ContentLabPlatform, string>>;
  /** Opaque; send it back as `cursor` for the next page of posts. Null when there are no more. */
  nextCursor: string | null;
};

export type CONTENT_LAB_SUGGEST_REQUEST = z.input<typeof CONTENT_LAB_SUGGEST_REQUEST_SCHEMA>;

/** One creator in the type-ahead list under the Watching / Creator box. */
export type CONTENT_LAB_SUGGESTION = {
  platform: ContentLabPlatform;
  /** "@handle", what the creator route takes. */
  handle: string;
  name: string | null;
  avatarUrl: string | null;
  followers: number | null;
  verified: boolean;
  url: string;
};

export type CONTENT_LAB_SUGGEST_RESPONSE = {
  query: string;
  platform: ContentLabPlatform;
  creators: CONTENT_LAB_SUGGESTION[];
};

export type CONTENT_LAB_SEGMENT = {
  label: string;
  startSeconds: number | null;
  endSeconds: number | null;
};

export type CONTENT_LAB_BREAKDOWN_RESPONSE = {
  post: CONTENT_LAB_POST;
  hook: { text: string | null; type: string | null; seconds: number | null };
  /** Ordered parts of the post (timeline for videos, slides for carousels). */
  structure: CONTENT_LAB_SEGMENT[];
  cta: { text: string | null; atPercent: number | null } | null;
  audience: {
    /** Seconds viewers point to in comments (rewatch moments), most-mentioned first. */
    rewatchedSeconds: number[];
    topComments: string[];
  };
  /** Full transcript (YouTube) or caption (Instagram), for writing "my version". */
  text: string | null;
  whyItWorked: string[];
};

export type CONTENT_LAB_CHECK_ITEM = {
  label: string;
  passed: boolean;
  detail: string;
};

export type CONTENT_LAB_CHECK_RESPONSE = {
  /** 0-100: how closely the draft matches what this niche's winners share. */
  score: number;
  checks: CONTENT_LAB_CHECK_ITEM[];
  /** The winners it was compared with. */
  winners: CONTENT_LAB_POST[];
};

export type CONTENT_LAB_CREATOR_RESPONSE = {
  creator: CONTENT_LAB_CREATOR;
  usualViews: number | null;
  /** Recent posts with their multiple, newest first. */
  posts: CONTENT_LAB_POST[];
};
