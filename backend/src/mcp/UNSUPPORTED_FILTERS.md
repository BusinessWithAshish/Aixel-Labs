# Unsupported MCP search filters (future backlog)

The Hermes tool brief describes search filters that the current YouTube search intelligence API does **not** support. MCP tools reuse the live Zod schemas for SSOT. Track these for a future search/intelligence enhancement.

## Hermes aliases vs live API

| Hermes field | Live API today | Notes |
|--------------|----------------|-------|
| `resultType` | `filter` (`video` \| `channel`) | Same semantics, different name |
| `maxResults` | `limit` | Live default/max come from `youtubeLimitSchema` |
| `filters.uploadDate` | — | `hour` \| `today` \| `week` \| `month` \| `year` — not implemented |
| `filters.duration` | — | Hermes `short`/`medium`/`long` ≠ live `YOUTUBE_DURATION_BUCKET` |
| `filters.sortBy` | — | `relevance` \| `viewCount` \| `rating` \| `date` — not implemented |

## Suggested-videos

| Hermes field | Live API today |
|--------------|----------------|
| `sourceChannelId` (required input) | Derived internally from source video details — do not require from agent |

## Bulk enrich

| Hermes constraint | Live API today |
|-------------------|----------------|
| Max 50 video IDs | `YOUTUBE_VIDEO_META_MAX_BATCH` (currently 100) |

## When implementing filters

1. Extend the raw YouTube search request/helpers first.
2. Propagate into `YOUTUBE_SEARCH_REQUEST_SCHEMA`.
3. MCP tools pick up the schema automatically — no parallel tool schemas.
