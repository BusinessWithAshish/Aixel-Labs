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
import { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "../api/youtube/suggest/schemas";
import { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA } from "../api/youtube/intelligence/transcript/schemas";
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
import { suggestIntelligenceService } from "../api/youtube/intelligence/suggest/service";
import { transcriptIntelligenceService } from "../api/youtube/intelligence/transcript/service";
import {
  GOOGLE_TRENDS_COMPARE_REQUEST_OBJECT_SCHEMA,
  GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
} from "../api/google-trends/interest/schemas";
import { googleTrendsInterestIntelligenceService } from "../api/google-trends/intelligence/single/service";
import { googleTrendsCompareIntelligenceService } from "../api/google-trends/intelligence/compare/service";
import { fetchGsearch } from "../api/gsearch";
import { GSEARCH_REQUEST_SCHEMA } from "../api/gsearch/schemas";
import { transcribe } from "../api/transcription/client";
import { TRANSCRIPTION_REQUEST_SCHEMA } from "../api/transcription/schemas";
import { fetchFromEntities, fetchFromQuery } from "../api/instagram/client";
import {
  INSTAGRAM_PROFILE_LOOKUP_SCHEMA,
  INSTAGRAM_PROFILE_SEARCH_SCHEMA,
} from "../api/instagram/schemas";
import { fetchInstagramAdvancedPosts } from "../api/instagram/advanced/client";
import { IG_ADVANCED_POSTS_REQUEST_SCHEMA } from "../api/instagram/advanced/schemas";
import {
  fetchInstagramAdvancedSearch,
  IG_ADVANCED_SEARCH_REQUEST_SCHEMA,
} from "../api/instagram/advanced/search";
import {
  fetchInstagramPopularSearch,
  IG_POPULAR_REQUEST_SCHEMA,
} from "../api/instagram/advanced/popular";
import { instagramAccountIntelligenceService } from "../api/instagram/intelligence/account/service";
import { INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA } from "../api/instagram/intelligence/account/schemas";
import {
  AGGREGATE_ACCOUNT_SIGNALS_SCHEMA,
  aggregateAccountSignalsService,
} from "../api/instagram/intelligence/aggregation";
import { fail, ok } from "./tool-result";

export const MCP_SERVER_NAME = "aixel-intelligence";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_TOOL_COUNT = 22;

export function createAixelIntelligenceMcpServer(): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  server.registerTool(
    "youtube_search_niche_intelligence",
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
    "youtube_get_video_intelligence",
    {
      description:
        "Fetch deep intelligence for a single YouTube video including velocity score, decay-adjusted velocity, engagement ratios, title analysis flags, channel tier, and subscriber efficiency at video level.\n\nUse this for deep analysis of a specific video — understanding why it performed, what patterns it follows, benchmarking against niche averages. Do NOT call this for every video in a search result — it is expensive. Reserve it for the top 5-10 performers identified after running youtube_search_niche_intelligence and youtube_aggregate_niche_signals first.\n\nsubscriberEfficiencyAtVideo tells you if this video outperformed its own channel — a strong signal that the topic has demand independent of channel authority.",
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
    "youtube_get_video_suggestions_intelligence",
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
    "youtube_get_channel_intelligence",
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
    "youtube_bulk_enrich_videos",
    {
      description:
        "Enrich a list of video IDs with metadata not available in search results — specifically publishedAt (absolute ISO timestamp), lengthSeconds, channelSubscribers, likeCount, commentCount — plus intelligence fields derived from these including publishedDaysAgo, durationBucket, publishedDayOfWeek, and publishedMonth.\n\nUse this when you have video IDs from search results that are missing publishedAt or channelSubscribers and need accurate velocity scores without fetching full video details individually.\n\nSignificantly cheaper than calling youtube_get_video_intelligence per video. Typical flow: youtube_search_niche_intelligence → youtube_bulk_enrich_videos on results missing publishedAt → youtube_aggregate_niche_signals on enriched results → youtube_get_video_intelligence on top 5 by velocity only.\n\ncommentCount is left null for videos where the lean lookup omits it, unless deepCommentLookup is set to true — that trades a full per-video HTML page fetch (proxy bandwidth) for a filled-in count. Leave it off unless you specifically need exact comment counts across the batch.",
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
    "youtube_aggregate_niche_signals",
    {
      description:
        "Compute niche-level intelligence signals from an array of intelligence-enriched video items. Pure in-memory aggregation — makes no API calls.\n\nUse this after youtube_search_niche_intelligence or youtube_bulk_enrich_videos to get niche-level conclusions: saturation score, velocity distribution (p25/p50/p75/p90), dominant duration format, channel tier distribution, lifecycle stage classification (emerging / growing / mature / saturated).\n\nAlways run this before making content recommendations — it gives the baseline against which individual video performance is judged. velocityDistribution.p75 is the threshold above which a video is genuinely outperforming in this niche.\n\nInput can combine items from multiple search calls for a more accurate distribution.",
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
    "youtube_aggregate_keyword_signals",
    {
      description:
        "Extract and score keyword intelligence from an array of intelligence-enriched video items. Pure in-memory aggregation — makes no API calls.\n\nComputes keyword frequency, average velocity per keyword, and velocityLift — the ratio of how often a keyword appears in top-quartile velocity videos vs bottom-quartile videos.\n\nUse after youtube_aggregate_niche_signals to identify which keywords are actually correlated with performance — not just which appear most frequently. velocityLift above 2.0 means a keyword appears at least twice as often in high performers vs low performers. Above 4.0 is exceptional.\n\nAlso returns titlePatterns — what fraction of top-quartile titles use numbers, questions, year references, and average title length comparison between top and bottom quartile performers.\n\nPass velocityDistribution.p75 from youtube_aggregate_niche_signals output as topQuartileThreshold.",
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
    "youtube_compare_channels",
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
    "youtube_resolve_handle",
    {
      description:
        "Resolve a YouTube channel handle (e.g. @ChannelName) to a channelId.\n\nUse this when you have a channel handle from search results or external references and need the channelId to call youtube_get_channel_intelligence. Lightweight lookup — call only when you have a handle but not a channelId. Both @handle and handle formats are accepted.",
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

  server.registerTool(
    "youtube_get_niche_keyword_tree",
    {
      description:
        "Map the complete search vocabulary of a niche by recursively seeding YouTube autocomplete. Takes a seed query, fetches its suggestions (depth 0), then for each suggestion fetches its own suggestions (depth 1) — one level of recursion only. Deduplicates across the full result set and computes per-suggestion intelligence (depth, year-recency flag, language/geo modifier flag, brand/proper-noun detection) plus aggregate intelligence (total unique count, detected competitors, detected language modifiers, keyword clusters grouping suggestions sharing a common 2–3 word phrase).\n\nCall this EARLY in any niche exploration or topic validation flow, before running search queries — it reveals exactly how real users phrase their searches and what sub-topics and competitors are embedded in the niche's search behavior. The keyword clusters field shows the main sub-topic buckets within the niche; the competitors field surfaces brand/channel names that appear in suggestions; the language modifiers field reveals localized sub-niches (e.g. Hindi, Spanish, UK) worth dedicated content. All depth-1 fetches run in parallel so latency stays low.",
      inputSchema: YOUTUBE_SUGGEST_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await suggestIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "youtube_get_video_transcript_intelligence",
    {
      description:
        "Fetch a YouTube video's transcript and compute deep content-level intelligence: four-zone pacing (intro / early / mid / outro with raw text + words-per-minute per zone), hook classification (question / bold_claim / story / direct_address / shock_stat / demonstration / standard), call-to-action detection with position (early / mid / late) and timestamp, top-30 keyword frequency, an optional title-alignment score (0–1) measuring how well the title's significant words appear in the transcript (intro zone weighted 2x), and an intro-length estimate of when setup language transitions into substantive content.\n\nThis tool is EXPENSIVE — use it selectively, only on confirmed top performers AFTER velocity scores and engagement ratios have already identified them as worth studying deeply. It gives you the ability to understand WHY a video worked at the content level, not just the metadata level. Particularly useful for identifying the hook pattern and CTA strategy that high-performing videos in a niche use. Pass the optional `title` field to get the titleAlignmentScore; omit it and that field is null. The `language` field defaults to English but accepts any BCP-47 code for future use.",
      inputSchema: YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await transcriptIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "trends_get_trend_intelligence",
    {
      description:
        "Fetch Google Trends interest-over-time data for a single keyword and compute the time dimension that no other tool in the system has: trend direction (rising / falling / stable) from linear-regression slope + consistency, lifecycle stage classification (emerging / growing / mature / declining), seasonal pattern detection (peak month, trough month, peak-to-trough ratio, optimal publish window — only runs on timeframes of 12+ months), breakout detection (rising queries Google flagged as Breakout, surfaced separately as the earliest acceleration signals), platform comparison (web vs YouTube demand-gap score — high web interest + low YouTube interest = content opportunity), geographic concentration (whether demand is globally spread or concentrated in 1–2 regions), and the top-10 rising related queries with parsed growth percentages.\n\nCall this whenever you need to validate whether a topic is growing or shrinking before recommending it. MANDATORY in trend detection mode. The lifecycle stage field alone often determines whether further research is worth doing — a DECLINING lifecycle stage on a topic means you should immediately suggest adjacent rising alternatives rather than going deeper on a dying niche. When the requested property is web (default) or youtube, the platform comparison fetches the other property in parallel and computes the demand gap; for other properties (news / images / shopping) platform comparison is null.",
      inputSchema: GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await googleTrendsInterestIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "trends_compare_trend_topics",
    {
      description:
        "Compare 2–5 keywords on Google Trends against each other in a single call. Google Trends normalises interest values onto a shared 0–100 scale so direct comparison is meaningful. Computes per-query trend direction + lifecycle stage (same classifier as trends_get_trend_intelligence), a relative dominance ranking (which query has the highest average interest, ranked 1–N), a momentum comparison (which query has the strongest positive recent slope regardless of absolute interest — a smaller topic with strong momentum is often a better bet than a larger topic that is flat or declining), and crossover points (when two queries trending in opposite directions had their interest lines cross during the timeframe — a significant signal in competitive niche analysis).\n\nUse this when you have identified multiple potential content angles or competing sub-niches and need to determine which one has better momentum right now, OR when a user asks you to compare two niches or topic ideas directly. The MOMENTUM comparison field is more important than the dominance ranking — a smaller but faster-growing topic is usually the better strategic choice. All queries share the same geo, timeframe, category, and property.",
      inputSchema: GOOGLE_TRENDS_COMPARE_REQUEST_OBJECT_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await googleTrendsCompareIntelligenceService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "transcription_transcribe_media",
    {
      description:
        "Transcribe a video or audio file at a given URL into a plain transcript using Groq Whisper — no summarization, just the raw transcript. Downloads the file server-side, extracts + normalizes its audio via ffmpeg (16kHz mono), then calls Groq's speech-to-text API.\n\nAccepts any publicly-reachable URL (a blob URL from POST /transcription/blob-upload, or any other hosted link — S3, a CDN, Google Drive's direct-download URL, etc.). It does NOT accept raw file bytes — MCP tool calls can't carry large binary payloads, so the caller must already have a URL.\n\n`format` controls the output shape: txt (plain text, default), json (full Groq verbose_json with segment timestamps), srt/vtt (caption files built from those segment timestamps — Groq has no native srt/vtt output, so these are generated here). Optional `language` (ISO-639-1) improves accuracy; optional `model` overrides the default whisper-large-v3-turbo.\n\nDo NOT use this for YouTube video URLs — use youtube_get_video_transcript_intelligence instead, which fetches YouTube's own caption track rather than re-transcribing audio. The downloaded file and its source blob are deleted after transcribing — nothing is persisted.",
      inputSchema: TRANSCRIPTION_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        return ok(await transcribe(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "gsearch_web_search",
    {
      description:
        "Search the live web via Google (organic CSE results) and return ranked pages with title, URL, snippet, display host, site name, thumbnails, and optional publish/modified times.\n\nUse this whenever you need current web evidence: find company/site URLs, discover lead pages, verify claims, research competitors, or gather sources outside YouTube.\n\nDEFAULT — plain query: pass searchQuery exactly like a normal Google search box query (e.g. \"best espresso machines under $500\"). No operators needed for general research; only reach for operators below when plain keywords aren't precise enough.\n\nADVANCED — operators confirmed working on this endpoint (tested live, not just per Google's docs):\n- \"exact phrase\" — quote multi-word phrases to force exact matches.\n- site:domain.com — restrict to one site/subdomain, combine with other terms (e.g. site:linkedin.com/in \"plumber\" Austin).\n- filetype:pdf|doc|xls|ppt — restrict to a file type (verified: returns real .pdf/.doc URLs, not just pages mentioning the type).\n- intitle:word or intitle:\"phrase\" — require the term in the page title. Reliable for single terms/phrases.\n- -exclude — drop a term (e.g. jaguar speed -car).\n- OR — either term (e.g. plumber OR electrician austin).\n- ( ) — group OR/exclude logic (e.g. (plumber OR electrician) austin -jobs).\n- before:YYYY-MM-DD / after:YYYY-MM-DD — hard date bound on indexed content; stack both for a range. Use this directly in searchQuery only when you need a custom window — for the common cases, the `timeFilter` param already applies this for you.\n- * — wildcard inside a quoted phrase (e.g. \"a * saved is a * earned\").\n\nAVOID — tested and unreliable or non-functional on this endpoint, do not use: allintitle:, allinurl:, allintext:, intext: (ignored or return irrelevant/zero results here, unlike plain google.com/search), cache: (Google retired this operator; zero results), related: (ignored — returns the queried domain itself, not similar sites), link: (Google deprecated this in 2017; ignored), AROUND(n) (no measurable proximity effect), define:/weather:/stocks:/movie:/map:/source: (these trigger Google's direct-answer and knowledge-panel features on google.com/search — this API returns organic results ONLY, so they do nothing here). inurl: and numeric ranges (e.g. 100..300) showed only a soft relevance nudge in testing, not a hard filter — don't rely on them alone to narrow results.\n\ncountry is required (ISO alpha-2) and routes geo; optional region/state append \"in City, State\" for local intent.\n\nIMPORTANT: timeFilter defaults to day (last 24 hours). Pass week | month | year when you need a wider window — year is usually right for evergreen research. pages defaults to 1 (20 results); max 6 (~120 — Google's hard CSE ceiling). Returns query metadata (resolvedQuery, estimatedResultCount, pagesFetched) plus results — not AI Overview, PAA, knowledge panel, or Maps.\n\nDo NOT use this for YouTube niche research (use youtube_search_niche_intelligence) or Trends demand curves (use trends_get_trend_intelligence).",
      inputSchema: GSEARCH_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = GSEARCH_REQUEST_SCHEMA.parse(args);
        return ok(await fetchGsearch(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_get_profile",
    {
      description:
        "Fetch public Instagram profile stats for one or more handles or profile URLs: follower/following/post counts, bio (+ parsed hashtags/mentions/websites), verified/private/business/professional flags, and business contact info (email, phone, category) when the account exposes it.\n\nUse this whenever you already have specific Instagram handle(s) or URL(s) and need their stats — the entry point for profile-level lead enrichment. If you only have a topic/niche and no handles yet, use instagram_search_profiles or instagram_search_content_leads first to discover handles.\n\nBatch up to 100 entities in one call rather than calling this once per handle. This tool returns stats only, not media — pair it with instagram_get_posts when you also need the account's actual posts/reels.",
      inputSchema: INSTAGRAM_PROFILE_LOOKUP_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = INSTAGRAM_PROFILE_LOOKUP_SCHEMA.parse(args);
        return ok(
          await fetchFromEntities(
            parsed.entities,
            parsed.country,
            parsed.limit,
          ),
        );
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_get_posts",
    {
      description:
        "Fetch a public Instagram profile's Posts-tab media — photos, videos/Reels, and carousels — with direct downloadable CDN URLs (imageUrl/images[] for photos, videoUrl/videos[] for video/Reel renditions, recursively for carousel items), captions, like/comment/play/view counts, and media type (image/video/carousel).\n\nPagination uses Instagram's own opaque cursor: the response's pageInfo.endCursor (their next_max_id) — pass it back as `cursor` to fetch the next page, and check pageInfo.hasNextPage before doing so. Or set `pages` (up to 20) to walk multiple pages in one call server-side instead of looping tool calls yourself.\n\nCall instagram_get_profile first (or alongside) if you also need follower/bio stats — this tool returns posts only, not profile stats.",
      inputSchema: IG_ADVANCED_POSTS_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = IG_ADVANCED_POSTS_REQUEST_SCHEMA.parse(args);
        return ok(await fetchInstagramAdvancedPosts(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_search_profiles",
    {
      description:
        "Discover Instagram profiles matching a free-text description by building a profile-title-biased Google search (site:instagram.com intitle:\"Instagram photos and videos\" …) from `query` + optional `keywords`/`hashtags`/`excludeKeywords`/`excludeHashtags`, then enriching every matched handle into full profile stats.\n\nThis is the DEFAULT discovery tool — use it first when the request describes a *type of account* (e.g. 'vegan food bloggers in Mumbai', 'fitness coaches'). `country` is required and also biases geography; `city`/`state` narrow further.\n\nIf results come back thin or empty, the profile-title bias is the likely cause (small/local/business accounts often don't rank on title match) — fall back to instagram_search_content_leads, which searches actual post/reel content instead of profile titles, or instagram_get_popular_topic for a native-Instagram (non-Google) angle.",
      inputSchema: INSTAGRAM_PROFILE_SEARCH_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = INSTAGRAM_PROFILE_SEARCH_SCHEMA.parse(args);
        return ok(await fetchFromQuery(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_search_content_leads",
    {
      description:
        "Discover Instagram accounts by searching actual post/reel content (site:instagram.com/p and /reel via Google), then resolving each matched post/reel back to its owner handle (via og:url) and optionally enriching those handles into full profile stats.\n\nUse this when instagram_search_profiles comes back thin — many small, local, or niche business accounts never rank on profile-title match but their individual posts do get indexed. Also better than instagram_search_profiles when the query itself describes content/topic rather than an account type (e.g. 'bridal makeup mumbai', 'salon pune').\n\n`kinds` controls post vs reel vs both (default both). Set enrichProfiles=false if you only need the discovered handles/content hits without the extra profile-stats round trip.",
      inputSchema: IG_ADVANCED_SEARCH_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = IG_ADVANCED_SEARCH_REQUEST_SCHEMA.parse(args);
        return ok(await fetchInstagramAdvancedSearch(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_get_popular_topic",
    {
      description:
        "Fetch Instagram's own native 'popular' reels grid for a topic keyword (instagram.com/popular/{query}/) — no Google/GSearch involved, so it surfaces Instagram's own trending/ranking signal for the topic rather than Google's index. Returns reel hits (handle, shortcode, view count text, caption snippet), related query suggestions, and optionally enriched profile leads for discovered handles.\n\nThis is the heaviest of the three discovery tools (headless-browser based) — reach for it as a fallback when instagram_search_profiles and instagram_search_content_leads (both Google-index-based) are exhausted, rate-limited, or when you specifically want Instagram's own 'what's popular right now' signal plus its related-query suggestions rather than a Google-ranked result set.",
      inputSchema: IG_POPULAR_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = IG_POPULAR_REQUEST_SCHEMA.parse(args);
        return ok(await fetchInstagramPopularSearch(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_get_account_intelligence",
    {
      description:
        "Fetch an Instagram account's profile stats and recent posts together, then compute per-post intelligence: engagement score (likes + 3×comments + 0.1×views), follower-normalized score (per 1,000 followers), recency-weighted velocity, engagement ratio, caption length, hashtag count, and a simple CTA-presence flag.\n\nUse this as the entry point for Instagram account/competitor research instead of calling instagram_get_profile and instagram_get_posts separately and computing these by hand — it does the arithmetic instagram_get_posts alone doesn't provide. Returns a lean post shape (no CDN rendition arrays) to stay well under response size limits. Private accounts return profile stats with an empty posts array.\n\nPass the returned `posts` array straight into instagram_aggregate_account_signals to get outlier detection, posting cadence, and score distribution for this account.",
      inputSchema: INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA,
    },
    async (args) => {
      try {
        const parsed = INSTAGRAM_ACCOUNT_INTELLIGENCE_REQUEST_SCHEMA.parse(args);
        return ok(await instagramAccountIntelligenceService(parsed));
      } catch (err) {
        return fail(err);
      }
    },
  );

  server.registerTool(
    "instagram_aggregate_account_signals",
    {
      description:
        "Compute account-level intelligence signals from an array of intelligence-enriched Instagram posts (the `posts` array from instagram_get_account_intelligence). Pure in-memory aggregation — makes no API calls.\n\nReturns average engagement/normalized scores, a score percentile distribution, an outlier threshold (mean + 2×stddev of follower-normalized score — needs at least 8 posts, otherwise null), the outlier posts themselves already filtered and sorted by velocity descending, posting cadence in days, media type distribution, and the ratio of posts that are Reels (eligible for transcription/hook analysis).\n\nAlways pass posts from a single account only — never mix accounts, since follower counts differ too much for one outlier threshold to mean anything across them.",
      inputSchema: AGGREGATE_ACCOUNT_SIGNALS_SCHEMA,
    },
    async (args) => {
      try {
        return ok(aggregateAccountSignalsService(args));
      } catch (err) {
        return fail(err);
      }
    },
  );

  return server;
}
