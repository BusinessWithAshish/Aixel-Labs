import { INSTAGRAM_ENGAGEMENT_WEIGHTS } from "../constants";
import { safeDivide } from "../math";

export function computeEngagementScore(
  likeCount: number | null,
  commentCount: number | null,
  playCount: number | null,
  viewCount: number | null,
): number | null {
  if (
    likeCount === null &&
    commentCount === null &&
    playCount === null &&
    viewCount === null
  ) {
    return null;
  }

  const likes = likeCount ?? 0;
  const comments = commentCount ?? 0;
  const views = playCount ?? viewCount ?? 0;

  return (
    likes * INSTAGRAM_ENGAGEMENT_WEIGHTS.LIKE +
    comments * INSTAGRAM_ENGAGEMENT_WEIGHTS.COMMENT +
    views * INSTAGRAM_ENGAGEMENT_WEIGHTS.VIEW
  );
}

/** (likes + comments) / followers — Instagram's analogue of a like-to-view
 * ratio; useful as a per-account engagement-quality signal. */
export function computeEngagementRatio(
  likeCount: number | null,
  commentCount: number | null,
  followers: number | null,
): number | null {
  if (likeCount === null && commentCount === null) return null;
  if (followers === null) return null;

  const likes = likeCount ?? 0;
  const comments = commentCount ?? 0;
  return safeDivide(likes + comments, followers);
}
