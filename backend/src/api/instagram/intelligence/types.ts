export type WithIntelligence<TRaw, TIntel> = TRaw & {
  intelligence: TIntel;
};

export type INSTAGRAM_INTELLIGENCE_PERCENTILES = {
  p25: number;
  p50: number;
  p75: number;
};

export type INSTAGRAM_POST_INTELLIGENCE_FIELDS = {
  publishedDaysAgo: number | null;
  engagementScore: number | null;
  followerNormalizedScore: number | null;
  velocity: number | null;
  engagementRatio: number | null;
  captionLength: number | null;
  hashtagCount: number | null;
  hasCTA: boolean | null;
};
