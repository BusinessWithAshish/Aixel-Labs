import { safeDivide } from "../math";

export function computeEngagementRatio(
  likeCount: number | null,
  commentCount: number | null,
  viewCount: number | null,
): number | null {
  if (likeCount === null && commentCount === null) return null;
  if (viewCount === null) return null;

  const likes = likeCount ?? 0;
  const comments = commentCount ?? 0;
  return safeDivide(likes + comments, viewCount);
}

export function computeLikeToViewRatio(
  likeCount: number | null,
  viewCount: number | null,
): number | null {
  if (likeCount === null || viewCount === null) return null;
  return safeDivide(likeCount, viewCount);
}

export function computeCommentToViewRatio(
  commentCount: number | null,
  viewCount: number | null,
): number | null {
  if (commentCount === null || viewCount === null) return null;
  return safeDivide(commentCount, viewCount);
}
