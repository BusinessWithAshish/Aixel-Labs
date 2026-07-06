import { computePublishedDaysAgo } from "../video/compute";
import type { YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS } from "./types";

export function enrichVideoMetaFields(
  publishedAt: string | null,
  harvestedAt: Date = new Date(),
): YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS {
  const publishedDaysAgo = computePublishedDaysAgo(publishedAt, harvestedAt);

  if (!publishedAt) {
    return {
      publishedDaysAgo,
      publishedDayOfWeek: null,
      publishedHourUTC: null,
      publishedMonth: null,
      publishedYear: null,
    };
  }

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) {
    return {
      publishedDaysAgo,
      publishedDayOfWeek: null,
      publishedHourUTC: null,
      publishedMonth: null,
      publishedYear: null,
    };
  }

  return {
    publishedDaysAgo,
    publishedDayOfWeek: published.getUTCDay(),
    publishedHourUTC: published.getUTCHours(),
    publishedMonth: published.getUTCMonth() + 1,
    publishedYear: published.getUTCFullYear(),
  };
}
