import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../constants";
import type { YOUTUBE_RECENT_VELOCITY_TREND_VALUE } from "../types";

export type YOUTUBE_NICHE_LIFECYCLE_STAGE =
  | "emerging"
  | "growing"
  | "mature"
  | "saturated";

export type YOUTUBE_NICHE_VELOCITY_DISTRIBUTION = {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export type YOUTUBE_NICHE_SIGNALS_RESPONSE = {
  nicheLabel: string | null;
  videoCount: number;
  avgVelocityScore: number | null;
  velocityDistribution: YOUTUBE_NICHE_VELOCITY_DISTRIBUTION | null;
  saturationScore: number | null;
  durationBucketDistribution: Record<YOUTUBE_DURATION_BUCKET, number>;
  channelTierDistribution: Record<YOUTUBE_CHANNEL_TIER, number>;
  shortRatio: number | null;
  dominantDurationBucket: YOUTUBE_DURATION_BUCKET | null;
  dominantChannelTier: YOUTUBE_CHANNEL_TIER | null;
  lifecycleStage: YOUTUBE_NICHE_LIFECYCLE_STAGE;
};

export type YOUTUBE_KEYWORD_SIGNAL = {
  keyword: string;
  frequency: number;
  avgVelocityScore: number | null;
  topQuartileFrequency: number;
  bottomQuartileFrequency: number;
  /**
   * `topQuartileFrequency / bottomQuartileFrequency`. `null` when the keyword
   * never appears in the bottom quartile (the ratio is undefined, not capped).
   * Use `topQuartileExclusive` to find those keywords instead of the old
   * misleading `Math.max(bottom, 1)` cap that treated 5/0 the same as 5/1.
   */
  velocityLift: number | null;
  /**
   * `true` when the keyword appears in the top velocity quartile but never in
   * the bottom quartile. These are the strongest "lift" signals but have no
   * computable ratio, so they are surfaced separately and ranked just after
   * computable lifts in the sort order.
   */
  topQuartileExclusive: boolean;
};

export type YOUTUBE_KEYWORD_TITLE_PATTERNS = {
  numberRatioInTopQuartile: number;
  questionRatioInTopQuartile: number;
  yearRatioInTopQuartile: number;
  avgTitleLengthInTopQuartile: number | null;
  avgTitleLengthInBottomQuartile: number | null;
};

export type YOUTUBE_KEYWORD_SIGNALS_RESPONSE = {
  keywords: YOUTUBE_KEYWORD_SIGNAL[];
  titlePatterns: YOUTUBE_KEYWORD_TITLE_PATTERNS;
};

export type YOUTUBE_COMPARE_CHANNELS_RANK_BY =
  | "subscriberEfficiencyRatio"
  | "velocityP75"
  | "uploadsPerWeek"
  | "recentVelocityTrend";

export type YOUTUBE_COMPARED_CHANNEL = {
  channelId: string;
  title: string;
  channelTier: YOUTUBE_CHANNEL_TIER | null;
  subscribers: number | null;
  subscriberEfficiencyRatio: number | null;
  velocityP75: number | null;
  recentVelocityTrend: YOUTUBE_RECENT_VELOCITY_TREND_VALUE | null;
  uploadsPerWeek: number | null;
  shortRatio: number | null;
  isKidsChannel: boolean | null;
  weaknessSignals: string[];
};

export type YOUTUBE_COMPARE_CHANNELS_RESPONSE = {
  rankedChannels: YOUTUBE_COMPARED_CHANNEL[];
  nicheDominant: string | null;
  mostVulnerable: string | null;
};
