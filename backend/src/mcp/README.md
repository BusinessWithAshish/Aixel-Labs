# MCP server (`/mcp`)

Streamable HTTP MCP for agents. Tools call the same TypeScript **services** as
HTTP handlers — **no HTTP loopback**.

|             |                                                     |
| ----------- | --------------------------------------------------- |
| Mount       | `ENDPOINTS.MCP` → `/mcp`                            |
| Server name | `aixel-intelligence`                                |
| Factory     | `createAixelIntelligenceMcpServer()` in `server.ts` |
| Tool count  | `MCP_TOOL_COUNT` (**8**)                            |

HTTP stays exploded (one POST per function). MCP collapses to **one tool per
domain**. Every tool takes the same top-level shape:

```ts
{ op: "<enum>", layer?: "raw" | "intel", input: { /* that op's HTTP body */ } }
```

- Default `layer`: `intel` when that op has a real overlay, else `raw`.
- Invalid `op`/`layer` combo **fails** — no silent fallback.
- `input` is parsed with the existing API `*_REQUEST_SCHEMA` (not a parallel MCP Zod tree).
- JSON Schema cannot vary `input` per `op`; the **tool description** is the dispatch table.

Lead-gen (Maps / Facebook / LinkedIn) stays **HTTP-only**.

## Tools

| Tool            | Ops                                                                                                                                                                | Layer                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `youtube`       | `search`, `suggest`, `video`, `suggested`, `transcript`, `comments`, `channel`, `handle`, `video_meta`, `aggregate_niche`, `aggregate_keyword`, `compare_channels` | intel where an overlay exists (incl. comments). Aggregates are compute-only (`raw`). |
| `trends`        | `interest`, `compare`, `trending`                                                                                                                                  | intel for interest/compare; `trending` raw-only                                      |
| `instagram`     | `profile`, `search_profiles`, `posts`, `content_leads`, `popular`, `account`, `aggregate_account`                                                                  | intel **only** for `account`. `aggregate_account` is compute/`raw`. Rest raw.        |
| `twitter`       | `user`, `tweet`, `user_tweets`, `trending`, `search`                                                                                                               | raw only (no Twitter intel API)                                                      |
| `gsearch`       | `search` (v1 CSE), `search_v2` (Docs Explore / CSE fallback)                                                                                                       | raw                                                                                  |
| `transcription` | `transcribe`                                                                                                                                                       | raw                                                                                  |
| `viral_clipper` | `diarize`, `moments`, `pipeline`, `cut`, `comment_highlights`, `chapters`                                                                                          | raw                                                                                  |
| `tightening`    | `tighten`                                                                                                                                                          | raw                                                                                  |

### Instagram discovery — which op

| Op                | Surface                      | Best for                                              |
| ----------------- | ---------------------------- | ----------------------------------------------------- |
| `search_profiles` | Google, profile-title biased | Default first try — "type of account" queries         |
| `content_leads`   | Google, post/reel content    | Local/niche accounts that don't rank on profile title |
| `popular`         | Native Instagram (no Google) | Fallback when both GSearch ops are thin/rate-limited  |

`account` is the intel overlay (profile + posts + engagement/velocity).
`aggregate_account` is in-memory compute over one account's intel `posts[]`.

### Twitter / X — which op

Guest GraphQL/REST — no user login. Native keyword search is login-walled.

| Op            | Surface                        | Best for                                                 |
| ------------- | ------------------------------ | -------------------------------------------------------- |
| `trending`    | X `trends/place.json`          | "What's trending right now"                              |
| `search`      | GSearch `site:x.com` + hydrate | Topic → tweets or profiles (needs Evomi)                 |
| `user`        | GraphQL `UserByScreenName`     | You already have a handle/URL                            |
| `user_tweets` | GraphQL `UserTweets`           | Profile timeline                                         |
| `tweet`       | GraphQL + syndication          | One tweet ID/URL; `includeRelated` for same-author posts |

### YouTube comments vs viral_clipper highlights

- `youtube` `op=comments` — InnerTube comment text, authors, likes, replies; `layer=intel` adds timestamp/like aggregates.
- `viral_clipper` `op=comment_highlights` — yt-dlp timestamp clusters for clip priors. Does not return the comments themselves.

## Layout

```
mcp/
├── router.ts        # Express mount + health
├── server.ts        # factory + MCP_TOOL_COUNT (registers 8 domain tools)
├── domain-tool.ts   # registerDomainTool({ op, layer, input })
├── tool-result.ts   # ok / fail wrappers
├── tools/           # one file per domain
└── UNSUPPORTED_FILTERS.md
```

## Agents

Skill: `.cursor/skills/backend/backend-mcp/SKILL.md`.
Governor: `.cursor/rules/backend/mcp.mdc`.
