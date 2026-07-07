import { YOUTUBE_DECAY_VELOCITY_BASE_DAYS } from "../constants";
import { safeDivide } from "../math";
import { computePublishedDaysAgo } from "./time";

export function computeViewsPerDay(
  viewCount: number | null,
  publishedDaysAgo: number | null,
): number | null {
  if (viewCount === null || publishedDaysAgo === null) return null;
  return safeDivide(viewCount, publishedDaysAgo);
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

  return safeDivide(
    safeDivide(viewCount, publishedDaysAgo),
    channelSubscribers,
  );
}

export function computeDecayAdjustedVelocity(
  velocityScore: number | null,
  publishedDaysAgo: number | null,
): number | null {
  if (velocityScore === null || publishedDaysAgo === null) return null;

  const decayFactor =
    1 /
    (1 +
      Math.log(safeDivide(publishedDaysAgo, YOUTUBE_DECAY_VELOCITY_BASE_DAYS)));

  return velocityScore * decayFactor;
}

export function computeAvgViewsPerVideo(
  totalViews: number | null,
  videoCount: number | null,
): number | null {
  if (totalViews === null || videoCount === null) return null;
  return safeDivide(totalViews, videoCount);
}

export function computeUploadsPerWeek(
  videoCount: number | null,
  channelAgeInDays: number | null,
): number | null {
  if (
    videoCount === null ||
    channelAgeInDays === null ||
    channelAgeInDays === 0
  ) {
    return null;
  }

  return videoCount / (channelAgeInDays / 7);
}

export function computeViewsPerSubscriber(
  totalViews: number | null,
  subscribers: number | null,
): number | null {
  if (totalViews === null || subscribers === null) return null;
  return safeDivide(totalViews, subscribers);
}

export function computeSubscriberEfficiencyAtVideo(
  viewCount: number | null,
  channelSubscribers: number | null,
): number | null {
  if (viewCount === null || channelSubscribers === null) return null;
  return safeDivide(viewCount, channelSubscribers);
}

export function computeViewsVsChannelAvg(
  views: number | null,
  channelAvgViews: number | null,
): number | null {
  if (views === null || channelAvgViews === null || channelAvgViews === 0) {
    return null;
  }

  return views / channelAvgViews;
}

export function computePublishingVelocityFields(
  publishedAt: string | null,
  views: number | null,
  harvestedAt: Date,
) {
  const publishedDaysAgo = computePublishedDaysAgo(publishedAt, harvestedAt);
  return {
    publishedDaysAgo,
    viewsPerDay: computeViewsPerDay(views, publishedDaysAgo),
  };
}
