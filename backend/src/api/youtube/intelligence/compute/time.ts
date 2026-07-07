import { MS_PER_DAY, YOUTUBE_INTELLIGENCE_PATTERNS } from "../constants";

export function computeDaysBetween(
  from: Date,
  to: Date = new Date(),
): number | null {
  if (Number.isNaN(from.getTime())) return null;
  const diffMs = to.getTime() - from.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

export function computePublishedDaysAgo(
  publishedAt: string | null,
  harvestedAt: Date = new Date(),
): number | null {
  if (!publishedAt) return null;

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;

  return computeDaysBetween(published, harvestedAt);
}

export function parseJoinedDate(joinedDateText: string | null): Date | null {
  if (!joinedDateText?.trim()) return null;

  const stripped = joinedDateText
    .replace(YOUTUBE_INTELLIGENCE_PATTERNS.CHANNEL_JOINED_DATE_PREFIX, "")
    .trim();
  const parsed = new Date(stripped);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function computeChannelAgeInDays(
  joinedDateText: string | null,
  harvestedAt: Date = new Date(),
): number | null {
  const joined = parseJoinedDate(joinedDateText);
  if (!joined) return null;
  return computeDaysBetween(joined, harvestedAt);
}
