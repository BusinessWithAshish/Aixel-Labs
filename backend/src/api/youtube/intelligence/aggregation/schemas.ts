import { z } from "zod";

export const AGGREGATE_NICHE_SIGNALS_SCHEMA = z.object({
  items: z
    .array(z.any())
    .describe(
      "Array of YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE objects. Can combine results from multiple search calls.",
    ),
  nicheLabel: z
    .string()
    .optional()
    .describe("Label for this niche — used for reference in output only."),
});

export const AGGREGATE_KEYWORD_SIGNALS_SCHEMA = z.object({
  items: z
    .array(z.any())
    .describe(
      "Array of YOUTUBE_SEARCH_VIDEO_ITEM_INTELLIGENCE or YOUTUBE_VIDEO_INTELLIGENCE_RESPONSE objects.",
    ),
  topQuartileThreshold: z
    .number()
    .describe(
      "Velocity score threshold above which a video is top-quartile. Use velocityDistribution.p75 from aggregate_niche_signals output.",
    ),
  maxKeywords: z
    .number()
    .int()
    .positive()
    .default(30)
    .describe(
      "Maximum keywords to return, ranked by velocityLift descending.",
    ),
});

export const COMPARE_CHANNELS_SCHEMA = z.object({
  channels: z
    .array(z.any())
    .describe("Array of YOUTUBE_CHANNEL_INTELLIGENCE_RESPONSE objects."),
  rankBy: z
    .enum([
      "subscriberEfficiencyRatio",
      "velocityP75",
      "uploadsPerWeek",
      "recentVelocityTrend",
    ])
    .default("subscriberEfficiencyRatio")
    .describe("Primary ranking signal for comparison."),
});
