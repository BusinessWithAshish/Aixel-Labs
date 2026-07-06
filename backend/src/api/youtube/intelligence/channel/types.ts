import type { WithIntelligence } from "../types";
import type {
  YOUTUBE_CHANNEL_RESPONSE,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
} from "../../channel/types";
import type {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../constants";

export type YOUTUBE_CHANNEL_VIDEO_ITEM_ENRICHED = YOUTUBE_CHANNEL_VIDEO_ITEM & {
  publishedAt: string | null;
  duration: number | null;
  likeCount: number | null;
  commentCount: number | null;
};

export type YOUTUBE_CHANNEL_VIDEO_INTELLIGENCE_FIELDS = {
  titleLength: number | null;
  titleHasNumber: boolean;
  titleHasQuestion: boolean;
  titleHasYear: boolean;
  publishedDaysAgo: number | null;
  viewsPerDay: number | null;
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
  isShort: boolean | null;
  engagementRatio: number | null;
  rankOnChannel: number | null;
  viewsVsChannelAvg: number | null;
};

export type YOUTUBE_CHANNEL_RECENT_VELOCITY_TREND =
  | "accelerating"
  | "stable"
  | "decelerating";

export type YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS = {
  channelAgeInDays: number | null;
  avgViewsPerVideo: number | null;
  uploadsPerWeek: number | null;
  subscriberEfficiencyRatio: number | null;
  channelTier: YOUTUBE_CHANNEL_TIER | null;
  viewsPerSubscriber: number | null;
  isKidsChannel: boolean | null;
  keywordCount: number;
  shortCount: number | null;
  videoOnlyCount: number | null;
  shortRatio: number | null;
  avgVideoDuration: number | null;
  topVideoViewCount: number | null;
  bottomVideoViewCount: number | null;
  velocityDistribution: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
  } | null;
  uploadsLast30Days: number | null;
  uploadsLast90Days: number | null;
  recentVelocityTrend: YOUTUBE_CHANNEL_RECENT_VELOCITY_TREND | null;
};

export type YOUTUBE_CHANNEL_SHORT_ITEM_ENRICHED = YOUTUBE_CHANNEL_SHORT_ITEM & {
  publishedAt: string | null;
  duration: number | null;
};

export type YOUTUBE_CHANNEL_SHORT_INTELLIGENCE_FIELDS = {
  publishedDaysAgo: number | null;
  viewsPerDay: number | null;
  isShort: true;
  titleLength: number | null;
  titleHasNumber: boolean;
  rankOnChannel: number | null;
  viewsVsChannelAvg: number | null;
};

export type YOUTUBE_CHANNEL_PLAYLIST_INTELLIGENCE_FIELDS = Record<
  string,
  never
>;

export type YOUTUBE_CHANNEL_VIDEO_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_CHANNEL_VIDEO_ITEM_ENRICHED,
  YOUTUBE_CHANNEL_VIDEO_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_CHANNEL_SHORT_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_CHANNEL_SHORT_ITEM_ENRICHED,
  YOUTUBE_CHANNEL_SHORT_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_CHANNEL_PLAYLIST_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
  YOUTUBE_CHANNEL_PLAYLIST_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_CHANNEL_ITEM_INTELLIGENCE =
  | YOUTUBE_CHANNEL_VIDEO_ITEM_INTELLIGENCE
  | YOUTUBE_CHANNEL_SHORT_ITEM_INTELLIGENCE
  | YOUTUBE_CHANNEL_PLAYLIST_ITEM_INTELLIGENCE;

export type YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE = Omit<
  YOUTUBE_CHANNEL_RESPONSE,
  "items"
> & {
  items: YOUTUBE_CHANNEL_ITEM_INTELLIGENCE[];
  intelligence: YOUTUBE_CHANNEL_INTELLIGENCE_FIELDS;
};
