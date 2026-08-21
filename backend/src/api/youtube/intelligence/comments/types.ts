import type { YOUTUBE_INTELLIGENCE_PERCENTILES, WithIntelligence } from "../types";
import type {
  YOUTUBE_COMMENT,
  YOUTUBE_VIDEO_COMMENTS_RESPONSE,
} from "../../comments/types";

export type YOUTUBE_COMMENT_TIMESTAMP_MENTION = {
  commentId: string;
  timestampSeconds: number;
  text: string;
};

export type YOUTUBE_COMMENT_INTELLIGENCE_FIELDS = {
  timestampSeconds: number[];
  hasTimestampMention: boolean;
};

export type YOUTUBE_COMMENT_WITH_INTELLIGENCE = WithIntelligence<
  YOUTUBE_COMMENT,
  YOUTUBE_COMMENT_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_COMMENTS_INTELLIGENCE_FIELDS = {
  scannedCount: number;
  uniqueAuthorCount: number;
  creatorHeartedCount: number;
  verifiedAuthorCount: number;
  creatorCommentCount: number;
  commentsWithTimestamps: number;
  likeCountSum: number;
  likeDistribution: YOUTUBE_INTELLIGENCE_PERCENTILES | null;
  timestampMentions: YOUTUBE_COMMENT_TIMESTAMP_MENTION[];
};

export type YOUTUBE_COMMENTS_INTELLIGENCE_RESPONSE = Omit<
  YOUTUBE_VIDEO_COMMENTS_RESPONSE,
  "comments"
> & {
  comments: YOUTUBE_COMMENT_WITH_INTELLIGENCE[];
  intelligence: YOUTUBE_COMMENTS_INTELLIGENCE_FIELDS;
};
