# @aixellabs/backend

Express scrapers, intelligence APIs, MCP server, and Mongo **schema SSOT**
(`src/db`). Frontend imports types/schemas via `@aixellabs/backend/*`. Scrapers
under `src/api` do **not** write Mongo.

## Quick start

```bash
pnpm --filter backend run dev    # http://localhost:8002
pnpm --filter backend run build
pnpm --filter backend run prod
```

Env: local `backend/.env` (proxy credentials such as `EVOMI_PROXY_*`, and any
module-specific secrets). Align frontend `BE_API` with this port.

## Mounts

Registered in `src/routes.ts` from `ENDPOINTS` in `src/config.ts`:

| Mount | Role |
|-------|------|
| `/` | Home / health |
| `/gmaps` | Maps search, place details, advanced URL batch |
| `/instagram` | Profile search + advanced (posts / search / popular) |
| `/facebook` | Facebook Page discovery |
| `/linkedin` | People or company search (`searchType`) |
| `/youtube` | Raw scrapers + `/intelligence/*` |
| `/gsearch` | CSE organic search (v1); `/gsearch/v2` Docs Explore |
| `/google-trends` | Trends + intelligence |
| `/crawl` | Crawl site for emails/phones |
| `/mcp` | Streamable HTTP MCP (`aixel-intelligence`) |

`ENDPOINTS.SAMPLE` exists in config but is **not** mounted.

## Layout

```
backend/
├── src/
│   ├── api/          # Product scrapers (ALApiResponse + Zod requests)
│   ├── db/           # Collections / Doc / LeadData SSOT
│   ├── mcp/          # MCP tools → same services as HTTP
│   ├── utils/        # TLS, Evomi proxy, location Zod (BE-only)
│   ├── config.ts     # ENDPOINTS + API_ENDPOINTS
│   ├── routes.ts     # app.use mounts
│   └── server.ts     # Boot (dotenv → middleware → listen / Vercel export)
├── scripts/          # Smoke / research CLIs
└── AGENTS.md         # Agent map → skills / rules
```

## Package exports

FE and other packages consume selected paths (`./db`, `./db/types`, `./config`,
`./gmaps`, `./gsearch`, module schemas, etc.) — see `package.json` `"exports"`.

## Agents

Conventions and skill pointers: [`AGENTS.md`](./AGENTS.md).  
New module pattern: mirror `src/api/crawl/` and follow
`.cursor/skills/backend/backend-api-module/SKILL.md`. New mounts:
`backend-platform` (`config.ts` + `routes.ts`).
