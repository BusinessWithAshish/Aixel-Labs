# MCP server (`/mcp`)

Streamable HTTP MCP for agents. Tools call the same TypeScript **services** as
HTTP intelligence handlers — **no HTTP loopback**.

| | |
|--|--|
| Mount | `ENDPOINTS.MCP` → `/mcp` |
| Server name | `aixel-intelligence` |
| Factory | `createAixelIntelligenceMcpServer()` in `server.ts` |
| Tool count | `MCP_TOOL_COUNT` (**20**) in `server.ts` |

Tool names are domain-prefixed (`youtube_*`, `trends_*`, `gsearch_*`,
`transcription_*`, `instagram_*`) so tools group by name alone even though
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

### Instagram discovery tool — which one to call

Three tools discover profiles from a topic/query; they hit different surfaces
and are not interchangeable:

| Tool | Surface | Best for |
|------|---------|----------|
| `instagram_search_profiles` | Google, profile-title biased | Default first try — "type of account" queries |
| `instagram_search_content_leads` | Google, post/reel content | Local/niche/business accounts that don't rank on profile title |
| `instagram_get_popular_topic` | Native Instagram (no Google) | Fallback when both GSearch-based tools are thin/rate-limited |

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
