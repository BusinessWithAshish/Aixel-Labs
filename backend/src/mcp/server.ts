import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../api/youtube/search/schemas";
import { YOUTUBE_VIDEO_REQUEST_SCHEMA } from "../api/youtube/video/schemas";
import { YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA } from "../api/youtube/video/schemas";
import {
  YOUTUBE_CHANNEL_REQUEST_OBJECT_SCHEMA,
  YOUTUBE_CHANNEL_REQUEST_SCHEMA,
} from "../api/youtube/channel/schemas";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../api/youtube/handle/schemas";
import { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "../api/youtube/video-meta/schemas";
import {
  AGGREGATE_NICHE_SIGNALS_SCHEMA,
  AGGREGATE_KEYWORD_SIGNALS_SCHEMA,
  COMPARE_CHANNELS_SCHEMA,
  aggregateNicheSignalsService,
  aggregateKeywordSignalsService,
  compareChannelsService,
} from "../api/youtube/intelligence/aggregation";
import { searchIntelligenceService } from "../api/youtube/intelligence/search/service";
import { videoIntelligenceService } from "../api/youtube/intelligence/video/service";
import { videoSuggestionsIntelligenceService } from "../api/youtube/intelligence/video/suggested/service";
import { channelIntelligenceService } from "../api/youtube/intelligence/channel/service";
import { resolveHandleService } from "../api/youtube/intelligence/handle/service";
import { bulkEnrichVideosService } from "../api/youtube/intelligence/video-meta/service";
import { fail, ok } from "./tool-result";

export const MCP_SERVER_NAME = "aixel-youtube-intelligence";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_TOOL_COUNT = 9;

export function createYoutubeIntelligenceMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "search_niche_intelligence",
    {
      description:
        "Search YouTube for videos or channels matching a query and return intelligence-enriched results with computed velocity scores, engagement ratios, title pattern flags, and niche-level aggregated signals across all returned items.\n\nUse this as the FIRST step for any niche research, topic discovery, content gap analysis, or when understanding what content is currently performing in a given space. Call multiple times with different queries to build a comprehensive niche picture.\n\nThe response top-level intelligence object contains pre-aggregated signals (saturation score, velocity distribution p25/p50/p75, duration bucket distribution, channel tier distribution, short ratio) computed across all returned items — use these for niche-level conclusions before analyzing individual items.",
      inputSchema: YOUTUBE_SEARCH_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await searchIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_video_intelligence",
    {
      description:
        "Fetch deep intelligence for a single YouTube video including velocity score, decay-adjusted velocity, engagement ratios, title analysis flags, channel tier, and subscriber efficiency at video level.\n\nUse this for deep analysis of a specific video — understanding why it performed, what patterns it follows, benchmarking against niche averages. Do NOT call this for every video in a search result — it is expensive. Reserve it for the top 5-10 performers identified after running search_niche_intelligence and aggregate_niche_signals first.\n\nsubscriberEfficiencyAtVideo tells you if this video outperformed its own channel — a strong signal that the topic has demand independent of channel authority.",
      inputSchema: YOUTUBE_VIDEO_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await videoIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_video_suggestions_intelligence",
    {
      description:
        "Fetch YouTube's suggested videos for a given video ID, enriched with intelligence fields including suggestion position weighting, same-channel detection, velocity proxies, and response-level aggregation showing channel diversity and dominant recommendation patterns.\n\nUse this to understand the recommendation neighborhood of a high-performing video — what YouTube algorithmically groups it with. Call on top-performing videos to map the recommendation graph of a niche.\n\nThe response intelligence object gives dominantChannelId and sameChannelRatio immediately — high sameChannelRatio means one channel owns the recommendation real estate in this niche. Also use for topic transition discovery — suggestions that are NOT in the same niche reveal adjacent audiences YouTube connects to this content.",
      inputSchema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await videoSuggestionsIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "get_channel_intelligence",
    {
      description:
        "Fetch intelligence-enriched data for a YouTube channel including channel-level metrics (subscriber efficiency ratio, upload cadence, recent velocity trend, kids channel flag) and per-video performance data with rank on channel and views-vs-channel-average comparisons.\n\nUse for competitor analysis — understanding how a successful channel operates, what content mix it uses, how consistent its performance is, and whether it is currently accelerating or decelerating.\n\ncontentType controls what items are returned: use videos for long-form and upload pattern analysis, shorts for Shorts strategy analysis, playlists for content organization strategy. Call with videos first. Call with shorts separately if shortRatio from the videos response indicates significant Shorts activity.\n\nrecentVelocityTrend in the channel intelligence object immediately tells you if a competitor is growing or fading without needing to analyze individual videos.",
      inputSchema: YOUTUBE_CHANNEL_REQUEST_OBJECT_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = YOUTUBE_CHANNEL_REQUEST_SCHEMA.parse(args);
        return ok(await channelIntelligenceService(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "bulk_enrich_videos",
    {
      description:
        "Enrich a list of video IDs with metadata not available in search results — specifically publishedAt (absolute ISO timestamp), lengthSeconds, channelSubscribers, likeCount, commentCount — plus intelligence fields derived from these including publishedDaysAgo, durationBucket, publishedDayOfWeek, and publishedMonth.\n\nUse this when you have video IDs from search results that are missing publishedAt or channelSubscribers and need accurate velocity scores without fetching full video details individually.\n\nSignificantly cheaper than calling get_video_intelligence per video. Typical flow: search_niche_intelligence → bulk_enrich_videos on results missing publishedAt → aggregate_niche_signals on enriched results → get_video_intelligence on top 5 by velocity only.",
      inputSchema: YOUTUBE_VIDEO_META_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await bulkEnrichVideosService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "aggregate_niche_signals",
    {
      description:
        "Compute niche-level intelligence signals from an array of intelligence-enriched video items. Pure in-memory aggregation — makes no API calls.\n\nUse this after search_niche_intelligence or bulk_enrich_videos to get niche-level conclusions: saturation score, velocity distribution (p25/p50/p75/p90), dominant duration format, channel tier distribution, lifecycle stage classification (emerging / growing / mature / saturated).\n\nAlways run this before making content recommendations — it gives the baseline against which individual video performance is judged. velocityDistribution.p75 is the threshold above which a video is genuinely outperforming in this niche.\n\nInput can combine items from multiple search calls for a more accurate distribution.",
      inputSchema: AGGREGATE_NICHE_SIGNALS_SCHEMA,
    },
    async (args) => {
      try {
        return ok(aggregateNicheSignalsService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "aggregate_keyword_signals",
    {
      description:
        "Extract and score keyword intelligence from an array of intelligence-enriched video items. Pure in-memory aggregation — makes no API calls.\n\nComputes keyword frequency, average velocity per keyword, and velocityLift — the ratio of how often a keyword appears in top-quartile velocity videos vs bottom-quartile videos.\n\nUse after aggregate_niche_signals to identify which keywords are actually correlated with performance — not just which appear most frequently. velocityLift above 2.0 means a keyword appears at least twice as often in high performers vs low performers. Above 4.0 is exceptional.\n\nAlso returns titlePatterns — what fraction of top-quartile titles use numbers, questions, year references, and average title length comparison between top and bottom quartile performers.\n\nPass velocityDistribution.p75 from aggregate_niche_signals output as topQuartileThreshold.",
      inputSchema: AGGREGATE_KEYWORD_SIGNALS_SCHEMA,
    },
    async (args) => {
      try {
        return ok(aggregateKeywordSignalsService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "compare_channels",
    {
      description:
        "Compare multiple channels side by side and produce a ranked competitive analysis. Pure in-memory computation — makes no API calls.\n\nUse after fetching channel intelligence for multiple competitors to understand who is winning, why, and who is most vulnerable to displacement.\n\nParticularly useful for identifying weak incumbents — channels ranking well in search but showing decelerating velocity trend, low subscriber efficiency, or inconsistent upload cadence. These are competitors you can displace.\n\nrankBy controls the primary ranking signal. subscriberEfficiencyRatio is recommended as default — it reveals channels whose content travels beyond their own audience, which is the strongest signal of genuine content quality vs channel authority.",
      inputSchema: COMPARE_CHANNELS_SCHEMA,
    },
    async (args) => {
      try {
        return ok(compareChannelsService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "resolve_handle",
    {
      description:
        "Resolve a YouTube channel handle (e.g. @ChannelName) to a channelId.\n\nUse this when you have a channel handle from search results or external references and need the channelId to call get_channel_intelligence. Lightweight lookup — call only when you have a handle but not a channelId. Both @handle and handle formats are accepted.",
      inputSchema: YOUTUBE_HANDLE_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await resolveHandleService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
