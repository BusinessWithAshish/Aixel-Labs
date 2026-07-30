---
name: backend-platform
description: >-
  Backend process wiring: config.ts (ENDPOINTS / API_ENDPOINTS / CORS), routes.ts
  (app.use mounts), server.ts (middleware, dotenv, rate limit, Vercel export).
  Use whenever adding or changing a product mount, MCP base path, ping/CORS/rate
  limit, or how the Express app boots locally vs on Vercel. Required context for
  any backend route or server change.
---

# Backend platform (`config` / `routes` / `server`)

Must-know wiring for **any** backend change that mounts a path, boots the
process, or exposes URLs to the frontend.

## Ownership

| File | Owns |
|------|------|
| `backend/src/config.ts` | `ENDPOINTS` enum, `API_ENDPOINTS` (`route` + `full`), CORS origin regexes |
| `backend/src/routes.ts` | `registerRoutes(app)` — `app.use(ENDPOINTS.*, router)` only |
| `backend/src/server.ts` | `dotenv/config` first, middleware stack, ping, `registerRoutes`, Vercel `export = app` vs local `listen` |

Product handlers live under `api/` or `mcp/` — they **do not** invent parallel
path constants. FE product calls use `API_ENDPOINTS.*.full` from
`@aixellabs/backend/config`.

## `ENDPOINTS` vs `API_ENDPOINTS`

```ts
ENDPOINTS.FACEBOOK = "/facebook"           // Express mount base
API_ENDPOINTS.FACEBOOK.API.route = "/"     // path on that router
API_ENDPOINTS.FACEBOOK.API.full = "/facebook"  // FE / apiClient path
```

- Module routers register with `.route`.
- Frontend (`lead-gen-api`, etc.) posts to `.full`.
- Subpaths often imported from module constants (YouTube, Trends, IG advanced, GMaps).
- `SAMPLE` exists in config but is **not** mounted in `routes.ts` — don’t assume every enum value is live.

## Middleware order (`server.ts`)

1. `trust proxy` (`TRUST_PROXY` or `VERCEL` → `1`)
2. `helmet`, disable `x-powered-by`
3. `cors` (dev/prod regexes; MCP headers allowed)
4. `express.json` (5mb)
5. `morgan`
6. `express.static(public)`
7. Global `rateLimit` (`RATE_LIMIT_MAX` or 100 / 15m)
8. `GET API_ENDPOINTS.PING` (`/v1/ping`) — extra-tight limit
9. `registerRoutes(app)`
10. `export = app`; if not `VERCEL`, `listen(PORT || 8002)`

**`import "dotenv/config"` must be first** so `PROXY_CONFIG` and other env-baked
constants see variables.

## New HTTP product mount checklist

1. Build module under `api/<name>/` (`backend-api-module`).
2. Add `ENDPOINTS` + `API_ENDPOINTS` in `config.ts`.
3. `app.use(ENDPOINTS.…, routes)` in `routes.ts`.
4. Optional `package.json` exports for FE schemas/types.
5. Optional MCP tool → `backend-mcp` (same service, no loopback).

## New MCP base path

Default stays `/mcp`. Extra servers: path-split under the MCP router **or** new
`ENDPOINTS` + `routes.ts` entry (`backend-mcp` skill).

## Env (platform)

| Var | Effect |
|-----|--------|
| `NODE_ENV` | CORS set, morgan format |
| `PORT` | Local listen (default 8002) |
| `VERCEL` | Skip `listen`; trust proxy default |
| `TRUST_PROXY` | Override trust proxy |
| `RATE_LIMIT_MAX` | Global limiter |

Proxy scrape env (`EVOMI_*`) is documented under `backend-utils`.

## Do / don’t

- DO change mounts only via `config.ts` + `routes.ts`.
- DO keep FE paths aligned with `API_ENDPOINTS.*.full`.
- DON’T hardcode product base paths in FE helpers when config already exports them.
- DON’T call `listen` on Vercel — keep `export = app`.
- DON’T move `dotenv` below modules that read `process.env` at import time.

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/platform.mdc` |
| API modules | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| MCP | `.cursor/skills/backend/backend-mcp/SKILL.md` |
| Utils / proxy env | `.cursor/skills/backend/backend-utils/SKILL.md` |
| DB schema | `.cursor/skills/backend/backend-db/SKILL.md` |
