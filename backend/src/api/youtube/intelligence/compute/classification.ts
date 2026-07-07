import { YOUTUBE_CHANNEL_TIER, YOUTUBE_DURATION_BUCKET } from "../../constants";
import {
  YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS,
  YOUTUBE_DURATION_THRESHOLDS_SECONDS,
  YOUTUBE_SHORT_MAX_SECONDS,
} from "../constants";

export function computeDurationBucket(
  lengthSeconds: number | null,
): YOUTUBE_DURATION_BUCKET | null {
  if (lengthSeconds === null) return null;
  if (
    lengthSeconds < YOUTUBE_DURATION_THRESHOLDS_SECONDS.SHORTS_MAX_EXCLUSIVE
  ) {
    return YOUTUBE_DURATION_BUCKET.SHORTS;
  }
  if (lengthSeconds < YOUTUBE_DURATION_THRESHOLDS_SECONDS.SHORT_MAX_EXCLUSIVE) {
    return YOUTUBE_DURATION_BUCKET.SHORT;
  }
  if (lengthSeconds < YOUTUBE_DURATION_THRESHOLDS_SECONDS.MID_MAX_EXCLUSIVE) {
    return YOUTUBE_DURATION_BUCKET.MID;
  }
  return YOUTUBE_DURATION_BUCKET.LONG;
}

export function computeIsShort(lengthSeconds: number | null): boolean | null {
  if (lengthSeconds === null) return null;
  return lengthSeconds < YOUTUBE_SHORT_MAX_SECONDS;
}

export function computeChannelTier(
  channelSubscribers: number | null,
): YOUTUBE_CHANNEL_TIER | null {
  if (channelSubscribers === null) return null;
  if (
    channelSubscribers <
    YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS.MICRO_MAX_EXCLUSIVE
  ) {
    return YOUTUBE_CHANNEL_TIER.MICRO;
  }
  if (
    channelSubscribers <
    YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS.SMALL_MAX_EXCLUSIVE
  ) {
    return YOUTUBE_CHANNEL_TIER.SMALL;
  }
  if (
    channelSubscribers <
    YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS.MID_MAX_EXCLUSIVE
  ) {
    return YOUTUBE_CHANNEL_TIER.MID;
  }
  return YOUTUBE_CHANNEL_TIER.LARGE;
}

export function computeIsKidsChannel(
  isFamilySafe: boolean | null,
): boolean | null {
  if (isFamilySafe === null) return null;
  return isFamilySafe;
}
