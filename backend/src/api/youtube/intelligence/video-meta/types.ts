import type { YOUTUBE_DURATION_BUCKET } from "../../constants";
import type { YOUTUBE_VIDEO_META_ITEM } from "../../video-meta";
import type { WithIntelligence } from "../types";

export type YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS = {
  publishedDaysAgo: number | null;
  publishedDayOfWeek: number | null;
  publishedHourUTC: number | null;
  publishedMonth: number | null;
  publishedYear: number | null;
  durationBucket: YOUTUBE_DURATION_BUCKET | null;
};

export type YOUTUBE_VIDEO_META_ITEM_INTELLIGENCE = WithIntelligence<
  YOUTUBE_VIDEO_META_ITEM,
  YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS
>;

export type YOUTUBE_VIDEO_META_INTELLIGENCE_RESPONSE = {
  items: YOUTUBE_VIDEO_META_ITEM_INTELLIGENCE[];
  requested: number;
  resolved: number;
};
