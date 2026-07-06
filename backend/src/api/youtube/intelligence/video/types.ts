import type { WithIntelligence } from "../types";
import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "../../video/types";
import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../constants";

export type YOUTUBE_VIDEO_INTELLIGENCE_FIELDS = {
  publishedDaysAgo: number | null;
  velocityScore: number | null;
  decayAdjustedVelocity: number | null;
  viewsPerDay: number | null;
  engagementRatio: number | null;
  likeToViewRatio: number | null;
  commentToViewRatio: number | null;
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
  isShort: boolean | null;
  titleLength: number | null;
  titleWordCount: number | null;
  descriptionLength: number | null;
  tagCount: number;
  hasHashtags: boolean;
  hashtagCount: number;
  titleHasNumber: boolean;
  titleHasQuestion: boolean;
  titleHasYear: boolean;
  channelTier: YOUTUBE_CHANNEL_TIER | null;
  subscriberEfficiencyAtVideo: number | null;
  suggestionDegree: number | null;
};

export type YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE = WithIntelligence<
  YOUTUBE_VIDEO_DETAILS_RESPONSE,
  YOUTUBE_VIDEO_INTELLIGENCE_FIELDS
>;
