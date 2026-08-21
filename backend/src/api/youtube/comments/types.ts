import type { z } from "zod";
import type { YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA } from "./schemas";
import type { YOUTUBE_COMMENTS_SORT } from "./constants";

export type YOUTUBE_VIDEO_COMMENTS_REQUEST = z.infer<
  typeof YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA
>;

export type YOUTUBE_COMMENTS_SORT_VALUE =
  (typeof YOUTUBE_COMMENTS_SORT)[keyof typeof YOUTUBE_COMMENTS_SORT];

export type YOUTUBE_COMMENT_AUTHOR = {
  channelId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  isCreator: boolean;
  isArtist: boolean;
};

export type YOUTUBE_COMMENT = {
  commentId: string;
  text: string;
  publishedTime: string | null;
  likeCount: number | null;
  likeCountText: string | null;
  replyCount: number | null;
  replyCountText: string | null;
  author: YOUTUBE_COMMENT_AUTHOR;
  isCreatorHearted: boolean;
  replyLevel: number;
  /** Pass back as `continuation` to fetch this comment's replies. */
  repliesContinuation: string | null;
};

export type YOUTUBE_VIDEO_COMMENTS_RESPONSE = {
  videoId: string;
  sort: YOUTUBE_COMMENTS_SORT_VALUE;
  commentsDisabled: boolean;
  commentCount: number | null;
  commentCountText: string | null;
  comments: YOUTUBE_COMMENT[];
  continuation: string | null;
};

// ─── InnerTube raw shapes (internal) ─────────────────────────────────────────

export type YOUTUBE_COMMENT_ENTITY_PAYLOAD = {
  properties?: {
    commentId?: string;
    content?: { content?: string };
    publishedTime?: string;
    replyLevel?: number;
  };
  author?: {
    channelId?: string;
    displayName?: string;
    avatarThumbnailUrl?: string;
    isVerified?: boolean;
    isCreator?: boolean;
    isArtist?: boolean;
  };
  toolbar?: {
    likeCountLiked?: string;
    likeCountNotliked?: string;
    replyCount?: string;
    heartActiveTooltip?: string;
  };
};

export type YOUTUBE_COMMENTS_NEXT_RESPONSE = {
  onResponseReceivedEndpoints?: Array<{
    reloadContinuationItemsCommand?: {
      targetId?: string;
      slot?: string;
      continuationItems?: unknown[];
    };
    appendContinuationItemsAction?: {
      targetId?: string;
      continuationItems?: unknown[];
    };
  }>;
  frameworkUpdates?: {
    entityBatchUpdate?: {
      mutations?: Array<{
        payload?: { commentEntityPayload?: YOUTUBE_COMMENT_ENTITY_PAYLOAD };
      }>;
    };
  };
};

export type YOUTUBE_COMMENTS_BOOTSTRAP = {
  commentsDisabled: boolean;
  commentCountText: string | null;
  defaultContinuation: string | null;
  continuationBySort: Partial<
    Record<YOUTUBE_COMMENTS_SORT_VALUE, string | null>
  >;
};

export type YOUTUBE_COMMENTS_PAGE = {
  comments: YOUTUBE_COMMENT[];
  continuation: string | null;
  commentCountText: string | null;
};
