import type { WithIntelligence } from "../types";
import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../constants";
import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_RESPONSE,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "../../search/types";

export type YOUTUBE_SEARCH_VIDEO_ITEM_ENRICHED = YOUTUBE_SEARCH_VIDEO_ITEM & {
  publishedAt: string | null;
  channelSubscribers: number | null;
};

export type YOUTUBE_SEARCH_VIDEO_INTELLIGENCE_FIELDS = {
  publishedDaysAgo: number | null;
  viewsPerDay: number | null;
  velocityScore: number | null;
  channelTier: YOUTUBE_CHANNEL_TIER | null;
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
  isShort: boolean | null;
  titleLength: number | null;
  titleWordCount: number | null;
  titleHasNumber: boolean;
  titleHasQuestion: boolean;
  titleHasYear: boolean;
  descriptionLength: number | null;
};

export type YOUTUBE_SEARCH_CHANNEL_INTELLIGENCE_FIELDS = {
  channelTier: YOUTUBE_CHANNEL_TIER | null;
};

export type YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_SEARCH_VIDEO_ITEM_ENRICHED,
  YOUTUBE_SEARCH_VIDEO_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_CHANNEL_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_SEARCH_ITEM_INTELLIGENCE =
  | YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE
  | YOUTUBE_SEARCH_CHANNEL_ITEM_INTELLIGENCE;

export type YOUTUBE_SEARCH_INTELLIGENCE_FIELDS = {
  avgViewsPerDay: number | null;
  avgTitleLength: number | null;
  shortRatio: number | null;
  titleWithNumberRatio: number;
  titleWithQuestionRatio: number;
  durationBucketDistribution: Record<YOUTUBE_DURATION_BUCKET, number>;
  channelTierDistribution: Record<YOUTUBE_CHANNEL_TIER, number>;
  estimatedSaturation: number | null;
  avgVelocityScore: number | null;
  topVelocityScore: number | null;
  velocityDistribution: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
  } | null;
};

export type YOUTUBE_SEARCH_INTELLIGENCE_RESPONSE = Omit<
  YOUTUBE_SEARCH_RESPONSE,
  "items"
> & {
  items: YOUTUBE_SEARCH_ITEM_INTELLIGENCE[];
  intelligence: YOUTUBE_SEARCH_INTELLIGENCE_FIELDS;
};
