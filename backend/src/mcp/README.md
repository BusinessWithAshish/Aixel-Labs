# MCP server (`/mcp`)

Streamable HTTP MCP for agents. Tools call the same TypeScript **services** as
HTTP handlers — **no HTTP loopback**.

|             |                                                     |
| ----------- | --------------------------------------------------- |
| Mount       | `ENDPOINTS.MCP` → `/mcp`                            |
| Server name | `aixel-intelligence`                                |
| Factory     | `createAixelIntelligenceMcpServer()` in `server.ts` |
| Tool count  | `MCP_TOOL_COUNT` (**10**)                           |

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
| `youtube`       | `search`, `suggest`, `video`, `suggested`, `transcript`, `comments`, `chapters`, `channel`, `handle`, `handle_check`, `video_meta`, `video_download`, `diarize`, `aggregate_niche`, `aggregate_keyword`, `compare_channels` | intel where an overlay exists (incl. comments). `chapters`, `handle_check`, `video_download`, `diarize` + aggregates are `raw` only. `handle_check` batch-validates candidate handles and checks availability (channel-name idea checks) via the auth-free InnerTube resolve_url — returns each handle's validity, whether it's free/taken, and the owning channelId when taken. `video_download` writes to local disk via a downloader site in the VPS's headed Chrome (no proxy bytes), cached — refused on Vercel and without an X display. `diarize` reads the video's own captions (free/cheap, no audio uploaded) into the same transcript shape `media` op=diarize produces — hard-fails on no captions, no fallback. |
| `trends`        | `interest`, `compare`, `trending`                                                                                                                                  | intel for interest/compare; `trending` raw-only                                      |
| `instagram`     | `profile`, `search_profiles`, `posts`, `download`, `content_leads`, `account`, `aggregate_account`                                                                 | intel **only** for `account`. `aggregate_account` is compute/`raw`. Rest raw. `download` writes post/reel/carousel media to local disk (direct, no proxy) — refused on Vercel. |
| `twitter`       | `user`, `tweet`, `user_tweets`, `trending`, `search`                                                                                                               | raw only (no Twitter intel API)                                                      |
| `gsearch`       | `search` (v1 CSE), `search_v2` (Docs Explore / CSE fallback)                                                                                                       | raw                                                                                  |
| `media`         | `fetch`, `transcribe`, `diarize`, `cut`, `condense`                                                                            | raw. Generic media primitives — no pipeline baked in, and never touches YouTube-specific code (get a YouTube video via `youtube` op=video_download or op=diarize first, then hand this tool the result). `diarize` here is Gemini-audio only — costs real money/quota; try `youtube` op=diarize (free) first for a YouTube source. `fetch`/`cut`/`condense` write to local disk — refused on Vercel (`IS_VERCEL_RUNTIME`). Clip scoring lives in the `segment` tool below, not here. |
| `segment`       | `by_speech`                                                                                                                            | raw. Decides WHAT to cut, `media` handles the mechanics. `by_speech` ranks a diarized transcript (hook/body/button rubric, tone-aware) into candidates shaped for `media` op=cut's `clips` field — works with a transcript from either `media` op=diarize or `youtube` op=diarize, they produce the same shape. Takes `provider` (`claude`|`gemini`, REQUIRED, no default) — see `api/segment/moments/README.md` for the cost/quota tradeoff. `by_scene`/`by_vision` not yet built. |
| `chatgpt`       | `ask`                                                                                                                                          | raw only (browser-driven, no intel overlay). **Needs a headful-browser host** — enabled only where an X display is present (auto-detected, refused on Vercel; no env flag). `stage_image` was removed, it had no ChatGPT-specific logic — use `media` op=fetch instead |
| `claude`        | `ask`, `budget_status`                                                                                                                                              | raw only (CLI-driven, no intel overlay). Runs on any machine with `claude` installed and authenticated — **not** VPS-gated (unlike `chatgpt`), fails with a plain error if the CLI is missing/unauthenticated |
| `gemini`        | `ask`                                                                                                                                          | raw only (browser-driven, no intel overlay). **Needs a headful-browser host** (X display auto-detected; refused on Vercel; no env flag). Text/image/video in and out on the logged-in gemini.google.com session (flat Google AI subscription). Its own Chrome instance (separate profile + port 9333) — independent of `chatgpt`, the two run concurrently. Video output is async (Veo, minutes); media staged to public URLs. Attach refs via `images`/`videos` (local paths — use `media` op=fetch for remote). |

### Instagram discovery — which op

| Op                | Surface                      | Best for                                              |
| ----------------- | ---------------------------- | ----------------------------------------------------- |
| `search_profiles` | Google, profile-title biased | Default first try — "type of account" queries         |
| `content_leads`   | Google, post/reel content    | Local/niche accounts that don't rank on profile title |

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

### YouTube comments → clip priors

`youtube` `op=comments` — InnerTube comment text, authors, likes, replies;
`layer=intel` adds timestamp mentions + 10s clusters, the input for
the parked moments scorer's `audienceSignals` (format via
`youtube/intelligence/audience-signals.ts` helpers). Chapter priors:
`youtube` `op=chapters`. The clipper no longer wraps these — fetch via
`youtube`, format, pass as `audienceSignals` to the moments scorer
`moments`/`pipeline`.

## Input shapes, validation, keepalive

- **Generated input shapes.** `registerDomainTool` appends an `INPUT SHAPES`
  section to every tool description, rendered from each op's own
  `*_REQUEST_SCHEMA` by `schema-signature.ts` — field names, types, enums,
  defaults, bounds, first sentence of each `.describe()`. Fields shared by 3+
  ops (country, region, …) print once under `SHARED FIELDS`. It is generated,
  so it cannot drift from what the op accepts: keep `.describe()` text in the
  module `constants.ts` accurate and the description stays accurate.
- **Unknown fields are rejected**, not stripped: `op=<op>: unknown field(s) X.
  Valid fields: …`. **Zod failures** come back as
  `op=<op>: invalid input — <path>: <message>. Expected: <shape>` so an agent
  can correct itself in one retry.
- **Keepalive.** While a call runs, the server sends a debug
  `notifications/message` every 20s (`logging` capability in `server.ts`).
  MCP clients drop a call whose stream is silent too long — Hermes at 300s —
  so without it long `diarize` / `segment` / `claude` calls failed mid-run.

## Layout

```
mcp/
├── router.ts        # Express mount + health
├── server.ts        # factory + MCP_TOOL_COUNT (registers 9 domain tools)
├── domain-tool.ts   # registerDomainTool({ op, layer, input })
├── tool-result.ts   # ok / fail wrappers
├── tools/           # one file per domain
└── UNSUPPORTED_FILTERS.md
```

## Agents

Skill: `.cursor/skills/backend/backend-mcp/SKILL.md`.
Governor: `.cursor/rules/backend/mcp.mdc`.
