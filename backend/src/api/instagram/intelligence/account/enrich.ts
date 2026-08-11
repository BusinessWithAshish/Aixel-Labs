import {
  computeCaptionLength,
  computeEngagementRatio,
  computeEngagementScore,
  computeFollowerNormalizedScore,
  computeHasCTA,
  computeHashtagCount,
  computeInstagramPublishedDaysAgo,
  computeVelocity,
} from "../compute";
import type { IG_ADVANCED_POST } from "../../advanced/types";
import type {
  INSTAGRAM_POST_ITEM_INTELLIGENCE,
  INSTAGRAM_POST_LEAN_FIELDS,
} from "./types";

function pickLeanFields(post: IG_ADVANCED_POST): INSTAGRAM_POST_LEAN_FIELDS {
  return {
    id: post.id,
    shortcode: post.shortcode,
    url: post.url,
    caption: post.caption,
    mediaType: post.mediaType,
    mediaTypeLabel: post.mediaTypeLabel,
    productType: post.productType,
    isVideo: post.isVideo,
    takenAt: post.takenAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    playCount: post.playCount,
    viewCount: post.viewCount,
    videoUrl: post.videoUrl,
    imageUrl: post.imageUrl,
  };
}

export function enrichPost(
  post: IG_ADVANCED_POST,
  followers: number | null,
  harvestedAt: Date = new Date(),
): INSTAGRAM_POST_ITEM_INTELLIGENCE {
  const publishedDaysAgo = computeInstagramPublishedDaysAgo(
    post.takenAt,
    harvestedAt,
  );
  const engagementScore = computeEngagementScore(
    post.likeCount,
    post.commentCount,
    post.playCount,
    post.viewCount,
  );
  const followerNormalizedScore = computeFollowerNormalizedScore(
    engagementScore,
    followers,
  );
  const velocity = computeVelocity(followerNormalizedScore, publishedDaysAgo);
  const engagementRatio = computeEngagementRatio(
    post.likeCount,
    post.commentCount,
    followers,
  );

  return {
    ...pickLeanFields(post),
    intelligence: {
      publishedDaysAgo,
      engagementScore,
      followerNormalizedScore,
      velocity,
      engagementRatio,
      captionLength: computeCaptionLength(post.caption),
      hashtagCount: computeHashtagCount(post.caption),
      hasCTA: computeHasCTA(post.caption),
    },
  };
}
