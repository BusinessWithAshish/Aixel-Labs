import {
  YOUTUBE_COMMENT_TIMESTAMP_CLUSTER_SAMPLE_LIMIT,
  YOUTUBE_COMMENT_TIMESTAMP_CLUSTER_WINDOW_SECONDS,
  YOUTUBE_COMMENT_TIMESTAMP_CLUSTERS_MAX,
  YOUTUBE_INTELLIGENCE_PATTERNS,
} from "../constants";
import type { YOUTUBE_COMMENT } from "../../comments/types";
import type {
  YOUTUBE_COMMENT_INTELLIGENCE_FIELDS,
  YOUTUBE_COMMENT_TIMESTAMP_CLUSTER,
  YOUTUBE_COMMENT_TIMESTAMP_MENTION,
  YOUTUBE_COMMENTS_INTELLIGENCE_FIELDS,
} from "./types";
import { computePercentiles } from "../math";

export function extractCommentTimestampSeconds(text: string): number[] {
  const matches: number[] = [];
  const pattern = new RegExp(
    YOUTUBE_INTELLIGENCE_PATTERNS.COMMENT_TIMESTAMP.source,
    YOUTUBE_INTELLIGENCE_PATTERNS.COMMENT_TIMESTAMP.flags,
  );
  for (const match of text.matchAll(pattern)) {
    const hours = match[1] ? Number(match[1]) : 0;
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    matches.push(hours * 3600 + minutes * 60 + seconds);
  }
  return matches;
}

type TimestampMentionForCluster = {
  timestampSeconds: number;
  text: string;
  likeCount: number;
};

/**
 * Greedy single-pass clustering: sort by timestamp, merge into the previous
 * cluster when within the window, else start a new one. Ranked by
 * mentionCount * 10 + totalLikes.
 */
export function clusterCommentTimestampMentions(
  mentions: TimestampMentionForCluster[],
  windowSeconds: number = YOUTUBE_COMMENT_TIMESTAMP_CLUSTER_WINDOW_SECONDS,
): YOUTUBE_COMMENT_TIMESTAMP_CLUSTER[] {
  const sorted = [...mentions].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const clusters: YOUTUBE_COMMENT_TIMESTAMP_CLUSTER[] = [];

  for (const mention of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && mention.timestampSeconds - last.timestampSeconds <= windowSeconds) {
      last.mentionCount += 1;
      last.totalLikes += mention.likeCount;
      if (last.sampleTexts.length < YOUTUBE_COMMENT_TIMESTAMP_CLUSTER_SAMPLE_LIMIT) {
        last.sampleTexts.push(mention.text);
      }
    } else {
      clusters.push({
        timestampSeconds: mention.timestampSeconds,
        mentionCount: 1,
        totalLikes: mention.likeCount,
        sampleTexts: [mention.text],
      });
    }
  }

  return clusters
    .sort(
      (a, b) =>
        b.mentionCount * 10 + b.totalLikes - (a.mentionCount * 10 + a.totalLikes),
    )
    .slice(0, YOUTUBE_COMMENT_TIMESTAMP_CLUSTERS_MAX);
}

export function enrichCommentIntelligence(
  comment: YOUTUBE_COMMENT,
): YOUTUBE_COMMENT_INTELLIGENCE_FIELDS {
  const timestampSeconds = extractCommentTimestampSeconds(comment.text);
  return {
    timestampSeconds,
    hasTimestampMention: timestampSeconds.length > 0,
  };
}

export function aggregateCommentsIntelligence(
  comments: Array<
    YOUTUBE_COMMENT & { intelligence: YOUTUBE_COMMENT_INTELLIGENCE_FIELDS }
  >,
): YOUTUBE_COMMENTS_INTELLIGENCE_FIELDS {
  const authorIds = new Set<string>();
  const timestampMentions: YOUTUBE_COMMENT_TIMESTAMP_MENTION[] = [];
  const clusterMentions: TimestampMentionForCluster[] = [];
  const likeCounts: number[] = [];
  let likeCountSum = 0;
  let creatorHeartedCount = 0;
  let verifiedAuthorCount = 0;
  let creatorCommentCount = 0;
  let commentsWithTimestamps = 0;

  for (const comment of comments) {
    if (comment.author.channelId) authorIds.add(comment.author.channelId);
    if (comment.isCreatorHearted) creatorHeartedCount += 1;
    if (comment.author.isVerified) verifiedAuthorCount += 1;
    if (comment.author.isCreator) creatorCommentCount += 1;
    if (comment.likeCount != null) {
      likeCounts.push(comment.likeCount);
      likeCountSum += comment.likeCount;
    }
    if (comment.intelligence.hasTimestampMention) {
      commentsWithTimestamps += 1;
      for (const timestampSeconds of comment.intelligence.timestampSeconds) {
        timestampMentions.push({
          commentId: comment.commentId,
          timestampSeconds,
          text: comment.text,
        });
        clusterMentions.push({
          timestampSeconds,
          text: comment.text.slice(0, 200),
          likeCount: comment.likeCount ?? 0,
        });
      }
    }
  }

  return {
    scannedCount: comments.length,
    uniqueAuthorCount: authorIds.size,
    creatorHeartedCount,
    verifiedAuthorCount,
    creatorCommentCount,
    commentsWithTimestamps,
    likeCountSum,
    likeDistribution: computePercentiles(likeCounts),
    timestampMentions,
    timestampClusters: clusterCommentTimestampMentions(clusterMentions),
  };
}
