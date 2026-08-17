# MCP server (`/mcp`)

Streamable HTTP MCP for agents. Tools call the same TypeScript **services** as
HTTP intelligence handlers — **no HTTP loopback**.

| | |
|--|--|
| Mount | `ENDPOINTS.MCP` → `/mcp` |
| Server name | `aixel-intelligence` |
| Factory | `createAixelIntelligenceMcpServer()` in `server.ts` |
| Tool count | `MCP_TOOL_COUNT` (**30**, **27** on Vercel — see below) in `server.ts` |

Tool names are domain-prefixed (`youtube_*`, `trends_*`, `gsearch_*`,
`transcription_*`, `instagram_*`, `viral_clipper_*`, `twitter_*`) so tools group by name alone even though
they all live on one `McpServer` instance — a possible follow-up is actually
splitting these into separate mounted server instances per domain.

## Tools

| Tool | Domain |
|------|--------|
| `youtube_search_niche_intelligence` | YouTube search + intelligence |
| `youtube_get_video_intelligence` | Single video |
| `youtube_get_video_suggestions_intelligence` | Related videos |
| `youtube_get_channel_intelligence` | Channel |
| `youtube_bulk_enrich_videos` | Video-meta batch |
| `youtube_aggregate_niche_signals` | Niche aggregates |
| `youtube_aggregate_keyword_signals` | Keyword aggregates |
| `youtube_compare_channels` | Channel compare |
| `youtube_resolve_handle` | Handle → channel |
| `youtube_get_niche_keyword_tree` | Suggest tree |
| `youtube_get_video_transcript_intelligence` | Transcript intelligence |
| `trends_get_trend_intelligence` | Google Trends interest |
| `trends_compare_trend_topics` | Trends compare |
| `gsearch_web_search` | Backend `/gsearch` (CSE) |
| `transcription_transcribe_media` | Groq Whisper transcription |
| `instagram_get_profile` | Handle/URL → profile stats |
| `instagram_get_posts` | Profile → paginated posts/reels/carousels w/ CDN URLs |
| `instagram_search_profiles` | Query → profile-title-biased GSearch discovery |
| `instagram_search_content_leads` | Query → content-first (`/p/`, `/reel/`) GSearch discovery |
| `instagram_get_popular_topic` | Topic → native IG `/popular/{q}/` reels (Puppeteer) |
| `instagram_get_account_intelligence` | Profile + posts → per-post engagement/velocity intelligence |
| `instagram_aggregate_account_signals` | Post-array → outlier detection, cadence, score distribution |
| `twitter_get_user` | Handle/URL → public profile stats |
| `twitter_get_tweet` | Tweet ID/URL → tweet (+ optional same-author related) |
| `twitter_get_user_tweets` | Handle → profile + recent timeline |
| `twitter_get_trending` | Country → X trending topics (guest REST) |
| `twitter_search` | Query → GSearch `site:x.com` + GraphQL hydrate |
| `viral_clipper_get_youtube_comment_highlights` | Video → audience-flagged timestamps from top comments (yt-dlp, no API key) — **VPS only, skipped on Vercel** |
| `viral_clipper_get_youtube_chapters` | Video → creator's own chapter markers (yt-dlp, no API key) — **VPS only, skipped on Vercel** |
| `tightening_remove_silences_and_fillers` | Video → same video with dead air + filler words cut out (ffmpeg silencedetect + Whisper word timestamps) — **VPS only, skipped on Vercel** |

### Instagram discovery tool — which one to call

Three tools discover profiles from a topic/query; they hit different surfaces
and are not interchangeable:

| Tool | Surface | Best for |
|------|---------|----------|
| `instagram_search_profiles` | Google, profile-title biased | Default first try — "type of account" queries |
| `instagram_search_content_leads` | Google, post/reel content | Local/niche/business accounts that don't rank on profile title |
| `instagram_get_popular_topic` | Native Instagram (no Google) | Fallback when both GSearch-based tools are thin/rate-limited |

### Twitter / X — which tool to call

Guest GraphQL/REST — no user login. Native keyword search is login-walled.

| Tool | Surface | Best for |
|------|---------|----------|
| `twitter_get_trending` | X `trends/place.json` | "What's trending right now" |
| `twitter_search` | GSearch `site:x.com` + hydrate | Topic → tweets or profiles (needs Evomi) |
| `twitter_get_user` | GraphQL `UserByScreenName` | You already have a handle/URL |
| `twitter_get_user_tweets` | GraphQL `UserTweets` | Profile timeline |
| `twitter_get_tweet` | GraphQL + syndication | One tweet ID/URL; `includeRelated` for same-author posts |

## Vercel vs VPS

Three tools are skipped on Vercel, for two different reasons — both covered
by `VPS_ONLY_ENDPOINTS` in `../config.ts`:

- The two `viral_clipper_*` comment/chapter tools shell out to yt-dlp, which
  isn't guaranteed present on Vercel's build image (the whole viral-clipper
  module is VPS-only regardless).
- `tightening_remove_silences_and_fillers` always re-encodes the entire
  source video — a minutes-long job, well past Vercel's serverless duration
  ceiling.

`server.ts` skips registering all three entirely when `IS_VERCEL_RUNTIME` is
true, instead of registering a tool that would just time out or fail at call
time; `MCP_TOOL_COUNT` reflects the actual count for the current runtime.

## Layout

```
mcp/
├── router.ts        # Express mount + health
├── server.ts        # registerTool + MCP_TOOL_COUNT
├── tool-result.ts   # ok / fail wrappers
└── UNSUPPORTED_FILTERS.md
```

## Agents

Skill: `.cursor/skills/backend/backend-mcp/SKILL.md`.  
Governor: `.cursor/rules/backend/mcp.mdc`.
