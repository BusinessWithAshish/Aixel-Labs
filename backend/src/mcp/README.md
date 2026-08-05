# MCP server (`/mcp`)

Streamable HTTP MCP for agents. Tools call the same TypeScript **services** as
HTTP intelligence handlers — **no HTTP loopback**.

| | |
|--|--|
| Mount | `ENDPOINTS.MCP` → `/mcp` |
| Server name | `aixel-youtube-intelligence` |
| Tool count | `MCP_TOOL_COUNT` (**14**) in `server.ts` |

## Tools

| Tool | Domain |
|------|--------|
| `search_niche_intelligence` | YouTube search + intelligence |
| `get_video_intelligence` | Single video |
| `get_video_suggestions_intelligence` | Related videos |
| `get_channel_intelligence` | Channel |
| `bulk_enrich_videos` | Video-meta batch |
| `aggregate_niche_signals` | Niche aggregates |
| `aggregate_keyword_signals` | Keyword aggregates |
| `compare_channels` | Channel compare |
| `resolve_handle` | Handle → channel |
| `get_niche_keyword_tree` | Suggest tree |
| `get_video_transcript_intelligence` | Transcript intelligence |
| `get_trend_intelligence` | Google Trends interest |
| `compare_trend_topics` | Trends compare |
| `google_web_search` | Backend `/gsearch` (CSE) |

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
