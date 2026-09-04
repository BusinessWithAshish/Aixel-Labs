---
name: backend-mcp
description: >-
  Build or extend the Aixel Labs MCP server under backend/src/mcp (Streamable HTTP
  at /mcp, domain tools with op/layer/input, ok/fail results, wiring to the same
  TypeScript services HTTP uses). Use when adding MCP tools/servers, editing
  mcp/server.ts, mcp/domain-tool.ts, mcp/tools/*, or connecting Cursor/agents to
  backend intelligence without HTTP loopback.
---

# Backend MCP (`backend/src/mcp`)

How MCP is attached to the Express backend and how to add tools/ops.

## Mental model

```
Cursor / MCP client
  → POST/GET /mcp  (Streamable HTTP)
  → mcp/router.ts  → createAixelIntelligenceMcpServer()
  → one tool per domain → op + optional layer + input
  → same TS service HTTP uses
  → ok(result) | fail(err)
```

**No HTTP loopback.** Tools call the same TypeScript services as HTTP handlers
(`api/youtube/*`, `api/google-trends/*`, `api/instagram/*`, …).

HTTP stays exploded: one `POST /{domain}/{op}` (and `POST /{domain}/intelligence/{op}`
when a real overlay exists). MCP is **not** 1:1 with HTTP routes.

Mount: `ENDPOINTS.MCP` (`/mcp`) via `routes.ts` — platform skill owns that wire-up.

## Layout

| File | Role |
|------|------|
| `server.ts` | `McpServer` factory, registers 10 domain tools, `MCP_TOOL_COUNT` |
| `domain-tool.ts` | `registerDomainTool` — `{ op, layer?, input }` dispatch |
| `tools/<domain>.ts` | Ops table + description dispatch table for that tool |
| `router.ts` | `GET /health`, `ALL /` → StreamableHTTP transport |
| `tool-result.ts` | `ok` / `fail` → `CallToolResult` |
| `UNSUPPORTED_FILTERS.md` | Backlog notes — live Zod remains schema SSOT |

## Server today

| Constant | Value |
|----------|--------|
| Name | `aixel-intelligence` |
| Version | `1.0.0` |
| Tools | `MCP_TOOL_COUNT` = **10** (keep in sync with domain registrations) |
| Package | `@modelcontextprotocol/sdk` |

Domains: `youtube`, `trends`, `instagram`, `twitter`, `gsearch`, `transcription`,
`viral_clipper`, `tightening`, `chatgpt`, `claude`. Lead-gen (Maps / Facebook /
LinkedIn) is HTTP-only unless product asks otherwise.

Health: `GET /mcp/health` → `{ status, server, tools }`.

Transport: **stateless** Streamable HTTP (`sessionIdGenerator: undefined`). CORS
allows `mcp-session-id` / `mcp-protocol-version` (see `server.ts` platform file).

## Tool pattern

Every domain tool uses the same top-level shape. MCP JSON Schema cannot vary
`input` per `op` — put the dispatch table in the **description**.

```ts
registerDomainTool(server, {
  name: "youtube",
  description: "…ops, valid layers, required input keys…",
  ops: {
    search: {
      defaultLayer: MCP_LAYER.INTEL,
      raw: { schema: YOUTUBE_SEARCH_REQUEST_SCHEMA, run: fetchYoutubeSearch },
      intel: { schema: YOUTUBE_SEARCH_REQUEST_SCHEMA, run: searchIntelligenceService },
    },
  },
});
```

| Layer | When |
|-------|------|
| `intel` | Real computed overlay exists (YouTube comments/search/video/…, Trends interest/compare, Instagram `account`) |
| `raw` | Scrape or in-memory compute with no overlay (Twitter, GSearch, transcription, viral_clipper, tightening, Instagram aggregates) |

Default `layer`: intel if that op has an overlay, else raw. Invalid combo **fails**
— no silent fallback. Aggregates/compute-only ops expose **raw only**.

`input` is parsed with the existing API `*_REQUEST_SCHEMA` inside the helper
(`.superRefine` is fine here — it is not the MCP JSON Schema). Do not fork a
parallel MCP Zod tree. Outer MCP schema is only `op` / `layer` / `input`.

## Add an op checklist (existing domain)

1. HTTP route already exists under `api/<domain>/` (`backend-api-module`) — or
   add it first if this is a new function.
2. Reuse `*_REQUEST_SCHEMA` as the layer handler `schema`.
3. Add the op to `mcp/tools/<domain>.ts` (`raw` and/or `intel` + `defaultLayer`).
4. Update that tool's description dispatch table (ops, valid layers, input keys).
5. `MCP_TOOL_COUNT` stays 10 unless you add a **new domain tool**.

## Add a domain tool checklist

1. New `mcp/tools/<domain>.ts` calling `registerDomainTool`.
2. Register it in `server.ts`; bump `MCP_TOOL_COUNT`.
3. HTTP module + `ENDPOINTS` / `routes.ts` via **platform** skill.
4. Still call services — never `fetch` the product HTTP API.

## Add a second MCP server checklist

1. New factory file under `mcp/` (e.g. `createLeadGenMcpServer()`).
2. Path-split in `router.ts` (`/mcp/youtube` vs `/mcp/…`) **or** new `ENDPOINTS` +
   `API_ENDPOINTS` + `routes.ts` mount (`backend-platform` skill).
3. Prefer the same `op` / `layer` / `input` shape.

## Do / don’t

- DO keep `input` schemas owned by `api/**/schemas.ts`.
- DO share services with HTTP handlers.
- DO put op/layer/input keys in the tool description (JSON Schema cannot vary `input` per op).
- DON’T register a new MCP tool per HTTP route — add an `op` on the domain tool.
- DON’T invent parallel MCP-only Zod trees.
- DON’T call `http://localhost…/youtube/…` from a tool.
- DON’T invent a fake `intel` layer when there is no overlay.
- DON’T skip registering tools based on `VERCEL`.
- DON’T forget `MCP_TOOL_COUNT` when adding/removing **domain** tools.

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/mcp.mdc` |
| Catalog | `backend/src/mcp/README.md` |
| Platform mount / CORS | `.cursor/skills/backend/backend-platform/SKILL.md` |
| Scraper / intelligence modules | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| TLS / shared Zod location | `.cursor/skills/backend/backend-utils/SKILL.md` |
