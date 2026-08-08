---
name: backend-mcp
description: >-
  Build or extend the Aixel Labs MCP server under backend/src/mcp (Streamable HTTP
  at /mcp, tool registration, ok/fail results, wiring to YouTube/Trends intelligence
  services). Use when adding MCP tools/servers, editing mcp/server.ts or router.ts,
  or connecting Cursor/agents to backend intelligence without HTTP loopback.
---

# Backend MCP (`backend/src/mcp`)

How MCP is attached to the Express backend and how to add tools/servers.

## Mental model

```
Cursor / MCP client
  → POST/GET /mcp  (Streamable HTTP)
  → mcp/router.ts  → createAixelIntelligenceMcpServer()
  → registerTool → *IntelligenceService / aggregation (same as HTTP)
  → ok(result) | fail(err)
```

**No HTTP loopback.** Tools call the same TypeScript services that intelligence
HTTP handlers use (`api/youtube/intelligence/*`, `api/google-trends/intelligence/*`,
`api/instagram/*`).

Mount: `ENDPOINTS.MCP` (`/mcp`) via `routes.ts` — platform skill owns that wire-up.

## Layout

| File | Role |
|------|------|
| `server.ts` | `McpServer` factory, `registerTool`s, `MCP_SERVER_NAME` / `VERSION` / `TOOL_COUNT` |
| `router.ts` | `GET /health`, `ALL /` → StreamableHTTP transport |
| `tool-result.ts` | `ok` / `fail` → `CallToolResult` |
| `UNSUPPORTED_FILTERS.md` | Backlog notes — live Zod remains schema SSOT |

## Server today

| Constant | Value |
|----------|--------|
| Name | `aixel-intelligence` |
| Version | `1.0.0` |
| Tools | `MCP_TOOL_COUNT` (keep in sync with registrations) |
| Package | `@modelcontextprotocol/sdk` |

One server factory: `createAixelIntelligenceMcpServer()`. Covers YouTube,
Google Trends, GSearch, transcription, and Instagram tools. Tool names are
domain-prefixed (`youtube_*`, `trends_*`, `gsearch_*`, `transcription_*`,
`instagram_*`) — keep any new tool's name prefixed to match its domain.

Health: `GET /mcp/health` → `{ status, server, tools }`.

Transport: **stateless** Streamable HTTP (`sessionIdGenerator: undefined`). CORS
allows `mcp-session-id` / `mcp-protocol-version` (see `server.ts` platform file).

## Tool pattern

```ts
server.registerTool(
  "tool_name",
  {
    description: "…when to call, what it returns…",
    inputSchema: SOME_REQUEST_SCHEMA, // from api/…/schemas — reuse, don't fork
  },
  async (args) => {
    try {
      return ok(await someIntelligenceService(args));
    } catch (err) {
      return fail(err);
    }
  },
);
```

| Kind | Examples |
|------|----------|
| Fetch + enrich | `youtube_search_niche_intelligence`, `youtube_get_video_intelligence`, `trends_get_trend_intelligence`, `instagram_get_profile` |
| Pure aggregate (sync) | `youtube_aggregate_niche_signals`, `youtube_compare_channels` |

Prefer Zod **object** schemas without `.superRefine` for MCP JSON Schema (see Trends
`*_REQUEST_OBJECT_SCHEMA` vs refined HTTP schema). Channel tools may `.parse` with
the refined schema inside the handler after MCP delivers the object shape.

## Add a tool checklist

1. Reusable service under `api/.../intelligence/.../service.ts` (or aggregation).
2. Reuse existing `*_REQUEST_SCHEMA` (add `.describe` on fields in the API module).
3. `registerTool` in `mcp/server.ts` with `ok` / `fail`.
4. Bump `MCP_TOOL_COUNT`.
5. No new Express mount if still under `/mcp`.

## Add a second MCP server checklist

1. New factory file under `mcp/` (e.g. `createLeadGenMcpServer()`).
2. Path-split in `router.ts` (`/mcp/youtube` vs `/mcp/…`) **or** new `ENDPOINTS` +
   `API_ENDPOINTS` + `routes.ts` mount (`backend-platform` skill).
3. Still call services — never `fetch` the product HTTP API.

## Do / don’t

- DO keep tool input schemas owned by `api/**/schemas.ts`.
- DO share services with HTTP intelligence handlers.
- DON’T invent parallel MCP-only Zod trees.
- DON’T call `http://localhost…/youtube/…` from a tool.
- DON’T forget `MCP_TOOL_COUNT` when adding/removing tools.

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/mcp.mdc` |
| Platform mount / CORS | `.cursor/skills/backend/backend-platform/SKILL.md` |
| Scraper / intelligence modules | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| TLS / shared Zod location | `.cursor/skills/backend/backend-utils/SKILL.md` |
