import { computePublishedDaysAgo } from "../compute";
import type { YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS } from "./types";

const EMPTY_PUBLISH_DATE_FIELDS: Pick<
  YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS,
  "publishedDayOfWeek" | "publishedHourUTC" | "publishedMonth" | "publishedYear"
> = {
  publishedDayOfWeek: null,
  publishedHourUTC: null,
  publishedMonth: null,
  publishedYear: null,
};

export function enrichVideoMetaFields(
  publishedAt: string | null,
  harvestedAt: Date = new Date(),
): YOUTUBE_VIDEO_META_INTELLIGENCE_FIELDS {
  const publishedDaysAgo = computePublishedDaysAgo(publishedAt, harvestedAt);

  if (!publishedAt) {
    return {
      publishedDaysAgo,
      ...EMPTY_PUBLISH_DATE_FIELDS,
    };
  }

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) {
    return {
      publishedDaysAgo,
      ...EMPTY_PUBLISH_DATE_FIELDS,
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
