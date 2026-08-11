import type { INSTAGRAM_INTELLIGENCE_PERCENTILES } from "../types";

export type INSTAGRAM_MEDIA_TYPE_DISTRIBUTION = {
  image: number;
  video: number;
  carousel: number;
  unknown: number;
};

export type INSTAGRAM_ACCOUNT_OUTLIER_ITEM = {
  id: string | null;
  shortcode: string | null;
  url: string | null;
  videoUrl: string | null;
  engagementScore: number | null;
  followerNormalizedScore: number | null;
  velocity: number | null;
};

export type INSTAGRAM_ACCOUNT_SIGNALS_RESPONSE = {
  username: string | null;
  postCount: number;
  avgEngagementScore: number | null;
  avgFollowerNormalizedScore: number | null;
  scoreDistribution: INSTAGRAM_INTELLIGENCE_PERCENTILES | null;
  /** null when postCount is below INSTAGRAM_MIN_POSTS_FOR_OUTLIER_DETECTION. */
  outlierThreshold: number | null;
  /** Already filtered + sorted by velocity descending — nothing left to
   * compute, only to interpret. */
  outlierItems: INSTAGRAM_ACCOUNT_OUTLIER_ITEM[];
  postingCadenceDays: number | null;
  mediaTypeDistribution: INSTAGRAM_MEDIA_TYPE_DISTRIBUTION;
  /** Fraction of posts that are Reels (isVideo && productType === "clips")
   * — eligible for transcription/hook analysis. */
  reelRatio: number | null;
};
