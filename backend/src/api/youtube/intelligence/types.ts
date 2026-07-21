import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../constants";
import type { YOUTUBE_RECENT_VELOCITY_TREND } from "./constants";

export type WithIntelligence<TRaw, TIntel> = TRaw & {
  intelligence: TIntel;
};

export type YOUTUBE_INTELLIGENCE_GEO_INPUT = {
  country: string;
  region?: string;
};

export type YOUTUBE_INTELLIGENCE_PERCENTILES = {
  p25: number;
  p50: number;
  p75: number;
};

export type YOUTUBE_INTELLIGENCE_PERCENTILE_DISTRIBUTION =
  YOUTUBE_INTELLIGENCE_PERCENTILES | null;

export type YOUTUBE_RECENT_VELOCITY_TREND_VALUE =
  (typeof YOUTUBE_RECENT_VELOCITY_TREND)[keyof typeof YOUTUBE_RECENT_VELOCITY_TREND];

export type YOUTUBE_INTELLIGENCE_PUBLISHING_FIELDS = {
  publishedDaysAgo: number | null;
  viewsPerDay: number | null;
};

export type YOUTUBE_INTELLIGENCE_TITLE_LENGTH_FIELD = {
  titleLength: number | null;
};

export type YOUTUBE_INTELLIGENCE_TITLE_PATTERN_FIELDS = {
  titleHasNumber: boolean;
  titleHasQuestion: boolean;
  titleHasYear: boolean;
};

export type YOUTUBE_INTELLIGENCE_TITLE_TEXT_FIELDS =
  YOUTUBE_INTELLIGENCE_TITLE_LENGTH_FIELD & {
    titleWordCount: number | null;
  } & YOUTUBE_INTELLIGENCE_TITLE_PATTERN_FIELDS;

export type YOUTUBE_INTELLIGENCE_DURATION_FIELDS = {
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
  isShort: boolean | null;
};

export type YOUTUBE_INTELLIGENCE_DESCRIPTION_LENGTH_FIELD = {
  descriptionLength: number | null;
};

export type YOUTUBE_INTELLIGENCE_VELOCITY_SCORE_FIELD = {
  velocityScore: number | null;
};

export type YOUTUBE_INTELLIGENCE_CHANNEL_TIER_FIELD = {
  channelTier: YOUTUBE_CHANNEL_TIER | null;
};

export type YOUTUBE_INTELLIGENCE_DURATION_BUCKET_DISTRIBUTION = Record<
  YOUTUBE_DURATION_BUCKET,
  number
>;

export type YOUTUBE_INTELLIGENCE_CHANNEL_TIER_DISTRIBUTION = Record<
  YOUTUBE_CHANNEL_TIER,
  number
>;
