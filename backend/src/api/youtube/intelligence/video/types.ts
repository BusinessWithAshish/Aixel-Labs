import type { WithIntelligence } from "../types";
import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "../../video/types";
import type {
  YOUTUBE_INTELLIGENCE_CHANNEL_TIER_FIELD,
  YOUTUBE_INTELLIGENCE_DURATION_FIELDS,
  YOUTUBE_INTELLIGENCE_PUBLISHING_FIELDS,
  YOUTUBE_INTELLIGENCE_TITLE_TEXT_FIELDS,
} from "../types";

export type YOUTUBE_VIDEO_INTELLIGENCE_FIELDS =
  YOUTUBE_INTELLIGENCE_PUBLISHING_FIELDS & {
    velocityScore: number | null;
    decayAdjustedVelocity: number | null;
    engagementRatio: number | null;
    likeToViewRatio: number | null;
    commentToViewRatio: number | null;
  } & YOUTUBE_INTELLIGENCE_DURATION_FIELDS &
    YOUTUBE_INTELLIGENCE_TITLE_TEXT_FIELDS & {
      descriptionLength: number | null;
      tagCount: number;
      hasHashtags: boolean;
      hashtagCount: number;
    } & YOUTUBE_INTELLIGENCE_CHANNEL_TIER_FIELD & {
      subscriberEfficiencyAtVideo: number | null;
      suggestionDegree: number | null;
    };

export type YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE = WithIntelligence<
  YOUTUBE_VIDEO_DETAILS_RESPONSE,
  YOUTUBE_VIDEO_INTELLIGENCE_FIELDS
>;
