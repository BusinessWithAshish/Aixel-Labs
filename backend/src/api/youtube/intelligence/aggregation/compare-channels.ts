import type { z } from "zod";
import { YOUTUBE_RECENT_VELOCITY_TREND } from "../constants";
import type { YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE } from "../channel/types";
import type { COMPARE_CHANNELS_SCHEMA } from "./schemas";
import type {
  YOUTUBE_COMPARE_CHANNELS_RANK_BY,
  YOUTUBE_COMPARE_CHANNELS_RESPONSE,
  YOUTUBE_COMPARED_CHANNEL,
} from "./types";

export type CompareChannelsInput = z.infer<typeof COMPARE_CHANNELS_SCHEMA>;

const TREND_RANK: Record<string, number> = {
  [YOUTUBE_RECENT_VELOCITY_TREND.ACCELERATING]: 3,
  [YOUTUBE_RECENT_VELOCITY_TREND.STABLE]: 2,
  [YOUTUBE_RECENT_VELOCITY_TREND.DECELERATING]: 1,
};

function asChannelResponses(
  channels: unknown[],
): YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE[] {
  return channels.filter(
    (channel): channel is YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE =>
      typeof channel === "object" &&
      channel !== null &&
      "channelId" in channel &&
      "intelligence" in channel,
  );
}

function weaknessSignals(
  channel: YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE,
): string[] {
  const signals: string[] = [];
  const intel = channel.intelligence;

  if (intel.recentVelocityTrend === YOUTUBE_RECENT_VELOCITY_TREND.DECELERATING) {
    signals.push("decelerating");
  }
  if (
    intel.subscriberEfficiencyRatio != null &&
    intel.subscriberEfficiencyRatio < 1
  ) {
    signals.push("low engagement");
  }
  if (intel.uploadsPerWeek != null && intel.uploadsPerWeek < 0.5) {
    signals.push("inconsistent cadence");
  }
  if (
    intel.velocityDistribution?.p75 != null &&
    intel.avgViewsPerVideo != null &&
    intel.velocityDistribution.p75 < intel.avgViewsPerVideo * 0.01
  ) {
    signals.push("weak velocity");
  }

  return signals;
}

function rankValue(
  channel: YOUTUBE_COMPARED_CHANNEL,
  rankBy: YOUTUBE_COMPARE_CHANNELS_RANK_BY,
): number {
  switch (rankBy) {
    case "subscriberEfficiencyRatio":
      return channel.subscriberEfficiencyRatio ?? Number.NEGATIVE_INFINITY;
    case "velocityP75":
      return channel.velocityP75 ?? Number.NEGATIVE_INFINITY;
    case "uploadsPerWeek":
      return channel.uploadsPerWeek ?? Number.NEGATIVE_INFINITY;
    case "recentVelocityTrend":
      return channel.recentVelocityTrend
        ? (TREND_RANK[channel.recentVelocityTrend] ?? 0)
        : 0;
  }
}

export function compareChannelsService(
  input: CompareChannelsInput,
): YOUTUBE_COMPARE_CHANNELS_RESPONSE {
  const channels = asChannelResponses(input.channels);
  const rankBy = input.rankBy;

  const rankedChannels: YOUTUBE_COMPARED_CHANNEL[] = channels
    .map((channel) => ({
      channelId: channel.channelId,
      title: channel.channelInfo?.title || channel.channelId,
      channelTier: channel.intelligence.channelTier,
      subscribers: channel.channelInfo?.subscribers ?? null,
      subscriberEfficiencyRatio:
        channel.intelligence.subscriberEfficiencyRatio,
      velocityP75: channel.intelligence.velocityDistribution?.p75 ?? null,
      recentVelocityTrend: channel.intelligence.recentVelocityTrend,
      uploadsPerWeek: channel.intelligence.uploadsPerWeek,
      shortRatio: channel.intelligence.shortRatio,
      isKidsChannel: channel.intelligence.isKidsChannel,
      weaknessSignals: weaknessSignals(channel),
    }))
    .sort((a, b) => rankValue(b, rankBy) - rankValue(a, rankBy));

  const nicheDominant = rankedChannels[0]?.channelId ?? null;

  const mostVulnerable =
    [...rankedChannels]
      .sort((a, b) => b.weaknessSignals.length - a.weaknessSignals.length)
      .find((channel) => channel.weaknessSignals.length > 0)?.channelId ??
    rankedChannels[rankedChannels.length - 1]?.channelId ??
    null;

  return {
    rankedChannels,
    nicheDominant,
    mostVulnerable,
  };
}
