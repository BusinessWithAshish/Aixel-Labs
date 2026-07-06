import type { WithIntelligence } from "../../types";
import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../../constants";
import type {
  YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE,
  YOUTUBE_VIDEO_SUGGESTION_ITEM,
} from "../../../video/types";

export type YOUTUBE_VIDEO_SUGGESTION_ITEM_ENRICHED =
  YOUTUBE_VIDEO_SUGGESTION_ITEM & {
    publishedAt: string | null;
    channelSubscribers: number | null;
  };

export type YOUTUBE_VIDEO_SUGGESTION_INTELLIGENCE_FIELDS = {
  suggestionPosition: number;
  publishedDaysAgo: number | null;
  viewsPerDay: number | null;
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
  isShort: boolean | null;
  titleLength: number | null;
  titleHasNumber: boolean;
  titleHasQuestion: boolean;
  titleHasYear: boolean;
  channelTier: YOUTUBE_CHANNEL_TIER | null;
  isSameChannel: boolean | null;
};

export type YOUTUBE_VIDEO_SUGGESTION_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_VIDEO_SUGGESTION_ITEM_ENRICHED,
  YOUTUBE_VIDEO_SUGGESTION_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_FIELDS = {
  sameChannelRatio: number;
  avgSuggestionPosition: number;
  durationBucketDistribution: Record<YOUTUBE_DURATION_BUCKET, number>;
  channelDiversityCount: number;
  dominantChannelId: string | null;
  dominantChannelCount: number;
};

export type YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_RESPONSE = Omit<
  YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE,
  "items"
> & {
  items: YOUTUBE_VIDEO_SUGGESTION_ITEM_INTELLIGENCE[];
  intelligence: YOUTUBE_VIDEO_SUGGESTED_INTELLIGENCE_FIELDS;
};
