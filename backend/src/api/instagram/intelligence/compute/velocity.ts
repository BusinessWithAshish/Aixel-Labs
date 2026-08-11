import {
  INSTAGRAM_NORMALIZATION_FOLLOWER_BASIS,
  INSTAGRAM_VELOCITY_MIN_DAYS,
} from "../constants";
import { safeDivide } from "../math";

/** Engagement score per 1,000 followers. Accounts under 1,000 followers are
 * floored to a 1,000-follower basis so tiny accounts don't produce wildly
 * inflated scores from a single divide. */
export function computeFollowerNormalizedScore(
  engagementScore: number | null,
  followers: number | null,
): number | null {
  if (engagementScore === null || followers === null) return null;
  const followersInThousands = followers / INSTAGRAM_NORMALIZATION_FOLLOWER_BASIS;
  return safeDivide(engagementScore, followersInThousands, 1);
}

/** Follower-normalized score decayed by recency — same-day posts use a
 * 0.5-day floor so brand-new posts don't produce a divide-by-near-zero
 * spike before their real engagement has had time to accrue. */
export function computeVelocity(
  followerNormalizedScore: number | null,
  publishedDaysAgo: number | null,
): number | null {
  if (followerNormalizedScore === null || publishedDaysAgo === null) {
    return null;
  }
  return safeDivide(
    followerNormalizedScore,
    publishedDaysAgo,
    INSTAGRAM_VELOCITY_MIN_DAYS,
  );
}
