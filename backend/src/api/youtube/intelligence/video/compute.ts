import {
  YOUTUBE_CHANNEL_TIER,
  YOUTUBE_DURATION_BUCKET,
} from "../../constants";

const MS_PER_DAY = 86_400_000;

export function computePublishedDaysAgo(
  publishedAt: string | null,
  harvestedAt: Date = new Date(),
): number | null {
  if (!publishedAt) return null;

  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return null;

  const diffMs = harvestedAt.getTime() - published.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

export function computeViewsPerDay(
  viewCount: number | null,
  publishedDaysAgo: number | null,
): number | null {
  if (viewCount === null || publishedDaysAgo === null) return null;
  return viewCount / Math.max(publishedDaysAgo, 1);
}

export function computeVelocityScore(
  viewCount: number | null,
  publishedDaysAgo: number | null,
  channelSubscribers: number | null,
): number | null {
  if (
    viewCount === null ||
    publishedDaysAgo === null ||
    channelSubscribers === null
  ) {
    return null;
  }

  return (
    viewCount /
    Math.max(publishedDaysAgo, 1) /
    Math.max(channelSubscribers, 1)
  );
}

export function computeDecayAdjustedVelocity(
  velocityScore: number | null,
  publishedDaysAgo: number | null,
): number | null {
  if (velocityScore === null || publishedDaysAgo === null) return null;

  const decayFactor =
    1 / (1 + Math.log(Math.max(publishedDaysAgo, 1) / 30));

  return velocityScore * decayFactor;
}

export function computeDurationBucket(
  lengthSeconds: number | null,
): YOUTUBE_DURATION_BUCKET | null {
  if (lengthSeconds === null) return null;
  if (lengthSeconds < 60) return YOUTUBE_DURATION_BUCKET.SHORTS;
  if (lengthSeconds < 300) return YOUTUBE_DURATION_BUCKET.SHORT;
  if (lengthSeconds < 1200) return YOUTUBE_DURATION_BUCKET.MID;
  return YOUTUBE_DURATION_BUCKET.LONG;
}

export function computeChannelTier(
  channelSubscribers: number | null,
): YOUTUBE_CHANNEL_TIER | null {
  if (channelSubscribers === null) return null;
  if (channelSubscribers < 10_000) return YOUTUBE_CHANNEL_TIER.MICRO;
  if (channelSubscribers < 100_000) return YOUTUBE_CHANNEL_TIER.SMALL;
  if (channelSubscribers < 1_000_000) return YOUTUBE_CHANNEL_TIER.MID;
  return YOUTUBE_CHANNEL_TIER.LARGE;
}

export function computeEngagementRatio(
  likeCount: number | null,
  commentCount: number | null,
  viewCount: number | null,
): number | null {
  if (likeCount === null && commentCount === null) return null;
  if (viewCount === null) return null;

  const likes = likeCount ?? 0;
  const comments = commentCount ?? 0;
  return (likes + comments) / Math.max(viewCount, 1);
}

export function computeLikeToViewRatio(
  likeCount: number | null,
  viewCount: number | null,
): number | null {
  if (likeCount === null || viewCount === null) return null;
  return likeCount / Math.max(viewCount, 1);
}

export function computeCommentToViewRatio(
  commentCount: number | null,
  viewCount: number | null,
): number | null {
  if (commentCount === null || viewCount === null) return null;
  return commentCount / Math.max(viewCount, 1);
}

export function computeSubscriberEfficiencyAtVideo(
  viewCount: number | null,
  channelSubscribers: number | null,
): number | null {
  if (viewCount === null || channelSubscribers === null) return null;
  return viewCount / Math.max(channelSubscribers, 1);
}

const HASHTAG_PATTERN = /#[\w-]+/g;
const TITLE_YEAR_PATTERN = /\b(19|20)\d{2}\b/;

function extractHashtags(...texts: Array<string | null>): string[] {
  const matches: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    matches.push(...(text.match(HASHTAG_PATTERN) ?? []));
  }
  return matches;
}

export function computeIsShort(lengthSeconds: number | null): boolean | null {
  if (lengthSeconds === null) return null;
  return lengthSeconds < 60;
}

export function computeTitleLength(title: string | null): number | null {
  return title?.length ?? null;
}

export function computeTitleWordCount(title: string | null): number | null {
  if (!title?.trim()) return title === null ? null : 0;
  return title.trim().split(/\s+/).length;
}

export function computeDescriptionLength(
  description: string | null,
): number | null {
  return description?.length ?? null;
}

export function computeTagCount(keywords: string[]): number {
  return keywords.length;
}

export function computeHasHashtags(
  title: string | null,
  description: string | null,
): boolean {
  return extractHashtags(title, description).length > 0;
}

export function computeHashtagCount(
  title: string | null,
  description: string | null,
): number {
  return extractHashtags(title, description).length;
}

export function computeTitleHasNumber(title: string | null): boolean {
  if (!title) return false;
  return /\d/.test(title);
}

export function computeTitleHasQuestion(title: string | null): boolean {
  if (!title) return false;
  return /\?/.test(title);
}

export function computeTitleHasYear(title: string | null): boolean {
  if (!title) return false;
  return TITLE_YEAR_PATTERN.test(title);
}
