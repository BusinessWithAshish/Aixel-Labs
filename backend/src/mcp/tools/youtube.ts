import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { YOUTUBE_SEARCH_REQUEST_SCHEMA } from "../../api/youtube/search/schemas";
import { fetchYoutubeSearch } from "../../api/youtube/search/helpers";
import { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "../../api/youtube/suggest/schemas";
import { fetchYoutubeSuggest } from "../../api/youtube/suggest/helpers";
import {
  YOUTUBE_VIDEO_REQUEST_SCHEMA,
  YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
} from "../../api/youtube/video/schemas";
import {
  fetchYoutubeVideoDetails,
  fetchYoutubeVideoSuggestedVideos,
} from "../../api/youtube/video/helpers";
import { YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA } from "../../api/youtube/transcript/schemas";
import { fetchYoutubeVideoTranscript } from "../../api/youtube/transcript/helpers";
import { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA } from "../../api/youtube/intelligence/transcript/schemas";
import { YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA } from "../../api/youtube/comments/schemas";
import { fetchYoutubeVideoComments } from "../../api/youtube/comments/helpers";
import { YOUTUBE_CHANNEL_REQUEST_SCHEMA } from "../../api/youtube/channel/schemas";
import { fetchYoutubeChannel } from "../../api/youtube/channel/helpers";
import {
  fetchYoutubeHandle,
  resolveYoutubeHandleToChannelId,
} from "../../api/youtube/handle/helpers";
import { YOUTUBE_HANDLE_REQUEST_SCHEMA } from "../../api/youtube/handle/schemas";
import { YOUTUBE_VIDEO_META_REQUEST_SCHEMA } from "../../api/youtube/video-meta/schemas";
import { fetchYoutubeVideoMeta } from "../../api/youtube/video-meta/helpers";
import {
  AGGREGATE_NICHE_SIGNALS_SCHEMA,
  AGGREGATE_KEYWORD_SIGNALS_SCHEMA,
  COMPARE_CHANNELS_SCHEMA,
  aggregateNicheSignalsService,
  aggregateKeywordSignalsService,
  compareChannelsService,
} from "../../api/youtube/intelligence/aggregation";
import { searchIntelligenceService } from "../../api/youtube/intelligence/search/service";
import { videoIntelligenceService } from "../../api/youtube/intelligence/video/service";
import { videoSuggestionsIntelligenceService } from "../../api/youtube/intelligence/video/suggested/service";
import { channelIntelligenceService } from "../../api/youtube/intelligence/channel/service";
import { resolveHandleService } from "../../api/youtube/intelligence/handle/service";
import { bulkEnrichVideosService } from "../../api/youtube/intelligence/video-meta/service";
import { suggestIntelligenceService } from "../../api/youtube/intelligence/suggest/service";
import { transcriptIntelligenceService } from "../../api/youtube/intelligence/transcript/service";
import { commentsIntelligenceService } from "../../api/youtube/intelligence/comments/service";
import { MCP_LAYER, registerDomainTool, type DomainOp } from "../domain-tool";
import type { z } from "zod";

type ChannelInput = z.infer<typeof YOUTUBE_CHANNEL_REQUEST_SCHEMA>;

async function fetchChannelRaw(input: ChannelInput) {
  const channelId =
    input.channelId ??
    (await resolveYoutubeHandleToChannelId(input.handle!, {
      country: input.country,
      region: input.region,
    }));
  return fetchYoutubeChannel({
    channelId,
    contentType: input.contentType,
    limit: input.limit,
    country: input.country,
    region: input.region,
  });
}

const YOUTUBE_OPS: Record<string, DomainOp> = {
  search: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_SEARCH_REQUEST_SCHEMA, run: fetchYoutubeSearch },
    intel: { schema: YOUTUBE_SEARCH_REQUEST_SCHEMA, run: searchIntelligenceService },
  },
  suggest: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_SUGGEST_REQUEST_SCHEMA, run: fetchYoutubeSuggest },
    intel: { schema: YOUTUBE_SUGGEST_REQUEST_SCHEMA, run: suggestIntelligenceService },
  },
  video: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_VIDEO_REQUEST_SCHEMA, run: fetchYoutubeVideoDetails },
    intel: { schema: YOUTUBE_VIDEO_REQUEST_SCHEMA, run: videoIntelligenceService },
  },
  suggested: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: {
      schema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
      run: fetchYoutubeVideoSuggestedVideos,
    },
    intel: {
      schema: YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA,
      run: videoSuggestionsIntelligenceService,
    },
  },
  transcript: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: {
      schema: YOUTUBE_VIDEO_TRANSCRIPT_REQUEST_SCHEMA,
      run: fetchYoutubeVideoTranscript,
    },
    intel: {
      schema: YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA,
      run: transcriptIntelligenceService,
    },
  },
  comments: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: {
      schema: YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA,
      run: fetchYoutubeVideoComments,
    },
    intel: {
      schema: YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA,
      run: commentsIntelligenceService,
    },
  },
  channel: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_CHANNEL_REQUEST_SCHEMA, run: fetchChannelRaw },
    intel: {
      schema: YOUTUBE_CHANNEL_REQUEST_SCHEMA,
      run: channelIntelligenceService,
    },
  },
  handle: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_HANDLE_REQUEST_SCHEMA, run: fetchYoutubeHandle },
    intel: { schema: YOUTUBE_HANDLE_REQUEST_SCHEMA, run: resolveHandleService },
  },
  video_meta: {
    defaultLayer: MCP_LAYER.INTEL,
    raw: { schema: YOUTUBE_VIDEO_META_REQUEST_SCHEMA, run: fetchYoutubeVideoMeta },
    intel: {
      schema: YOUTUBE_VIDEO_META_REQUEST_SCHEMA,
      run: bulkEnrichVideosService,
    },
  },
  aggregate_niche: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: AGGREGATE_NICHE_SIGNALS_SCHEMA,
      run: aggregateNicheSignalsService,
    },
  },
  aggregate_keyword: {
    defaultLayer: MCP_LAYER.RAW,
    raw: {
      schema: AGGREGATE_KEYWORD_SIGNALS_SCHEMA,
      run: aggregateKeywordSignalsService,
    },
  },
  compare_channels: {
    defaultLayer: MCP_LAYER.RAW,
    raw: { schema: COMPARE_CHANNELS_SCHEMA, run: compareChannelsService },
  },
};

const YOUTUBE_DESCRIPTION = `YouTube search, video, comments, channel, and compute aggregators.

Call with { op, layer?, input }. layer defaults to intel when that overlay exists, else raw. Invalid combo fails.

Ops:
- search (raw|intel, default intel) — keyword search. input: query, filter?, limit?, country?, region?
- suggest (raw|intel, default intel) — typeahead suggestions. input: query, country?, region?
- video (raw|intel, default intel) — one video's details. input: videoId, country?, region?
- suggested (raw|intel, default intel) — related/suggested videos. input: videoId, limit?, country?, region?
- transcript (raw|intel, default intel) — captions. intel input may include title. input: videoId, language?, country?, region?, title?
- comments (raw|intel, default intel) — InnerTube comment threads. intel adds timestamp mentions + 10s clusters for clip priors. Distinct from viral_clipper comment_highlights (formatter over the same clusters). input: videoId, sort?, limit?, continuation?, country?, region?
- channel (raw|intel, default intel) — channel + tab. input: channelId OR handle, contentType?, limit?, country?, region?
- handle (raw|intel, default intel) — resolve @handle. input: handle, country?, region?
- video_meta (raw|intel, default intel) — batch watch-page metadata. input: videoIds[], country?, region?
- aggregate_niche (raw only) — compute-only niche signals from harvested videos
- aggregate_keyword (raw only) — compute-only keyword signals
- compare_channels (raw only) — compute-only channel comparison

Prefer intel for analysis. Use raw when you need the scrape payload as HTTP returns it. Aggregates ignore intel — they are in-memory compute.`;

export function registerYoutubeTool(server: McpServer): void {
  registerDomainTool(server, {
    name: "youtube",
    description: YOUTUBE_DESCRIPTION,
    ops: YOUTUBE_OPS,
  });
}
