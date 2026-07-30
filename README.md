# Aixel Labs

**Agentic lead management system** — multi-tenant web app for credited lead
generation, with Firebase auth, Mongo persistence, and a scraper/intelligence
backend (including an MCP server for YouTube / Google Trends).

> Status: **active development**. Lead generation is the primary production path;
> messaging/voice are partial; several modules exist as enums/URLs only.

## What it does

| Area | Today |
|------|--------|
| **Lead generation** | Google Maps (+ advanced), Google Advanced Search, Instagram Search, Facebook, LinkedIn (company; people behind a flag) — scrape → save lists → credits |
| **Auth & tenancy** | Firebase identity ↔ Mongo membership, device fingerprint, subdomain tenants (`IFRAME` / `PRODUCT` / `EXTERNAL`), admin manage-tenants |
| **Credits** | Per-item costs, coupons; admins are credit-exempt |
| **Intelligence / MCP** | YouTube + Google Trends HTTP APIs and MCP tools at `/mcp` (no first-class product UI yet) |
| **Messaging / voice** | SMS & WhatsApp (Twilio Functions), web dialer page; parent module pages are placeholders |

Canonical product description in app config: *“Agentic Lead management system”*.

## Monorepo

| Package | Role | Default port |
|---------|------|----------------|
| [`frontend/`](frontend/) | Next.js 15 app (UI, BFF, server actions) | **3003** |
| [`backend/`](backend/) | Express scrapers, intelligence, MCP, Mongo **schema SSOT** (`src/db`) | **8002** |
| [`browser-worker/`](browser-worker/) | Optional Puppeteer worker (`/gsearch`, `/gmaps/scrape`) | **8080** |
| [`scraper/`](scraper/) | Python FastAPI + Botasaurus (legacy/sidecar; not in root `devAll`) | — |

Frontend imports shared types/schemas via `@aixellabs/backend/*`. Scrapers do **not**
write Mongo; the Next.js app persists leads/credits/tenants.

## Working features

- Credited lead scrapers listed above + lead lists / dashboard
- Multi-tenant admin (users, coupons, module access)
- Backend mounts: gmaps, instagram, facebook, linkedin, youtube, gsearch, google-trends, website-contacts, mcp
- MCP server `aixel-youtube-intelligence` (niche/video/channel/transcript/trends tools)

## Incomplete / future scope

| Item | Notes |
|------|--------|
| Instagram Advanced | BE routes exist; FE is Coming Soon; not in credit/dispatch maps |
| Website contacts | `POST /website-contacts` live on BE; not wired to FE lead-gen / `LeadData` yet |
| YouTube / Trends product UI | HTTP + MCP only |
| Email / lead enrichment | Module enums + sidebar URLs; no pages |
| Voice agent (beyond dialer) | Placeholder parent page; inquiry/analytics URLs unused |
| NL chat on scrapers | Code present; feature flags default **off** |
| browser-worker as primary SERP | Optional; production `/gsearch` is browserless CSE; research docs under `backend/src/api/gsearch/` |
| `SAMPLE` endpoint | In config; not mounted |
| Python `scraper/` | Workspace member; not required for current IG/Maps paths |

## Architecture (short)

```text
Browser → frontend (Next)
            ├─ /api/* BFF (scrape proxy, session, NL, …)
            ├─ server actions → Mongo via @aixellabs/backend/db
            └─ apiClient → backend Express (scrapers / intelligence)

Agents  → backend /mcp (Streamable HTTP) → same intelligence services as HTTP
```

Schema SSOT: [`backend/src/db/types.ts`](backend/src/db/types.ts).  
Agent conventions: [`AGENTS.md`](AGENTS.md), [`.cursor/`](.cursor/).

## Local development

```bash
# Install (frontend + backend + browser-worker)
pnpm installAll

# Preferred per-package (align BE_API with backend port)
pnpm --filter frontend dev          # http://localhost:3003
pnpm --filter backend run dev       # http://localhost:8002
pnpm --filter browser-worker run dev  # optional
```

Root scripts `devBE` / `prodBE` may not match current backend script names (`dev` /
`prod`) — prefer `pnpm --filter backend run …`.

**Secrets:** Firebase + Mongo for the app; backend needs scrape/proxy env (e.g.
`EVOMI_PROXY_*`). See `frontend/.env.example` and backend local `.env`.

## Stack

- **FE:** Next.js 15, React 19, TypeScript, Tailwind v4, shadcn/Radix, RHF + Zod, Firebase, Flags SDK, AI SDK
- **BE:** Express, Zod, Cheerio/jsdom, node-tls-client + proxy, MCP SDK, Mongo types/client
- **Tooling:** pnpm workspaces

## Contributing (agents & humans)

1. Read [`AGENTS.md`](AGENTS.md) (and `frontend/` or `backend/` AGENTS when in that package).
2. Follow skills under [`.cursor/skills/`](.cursor/skills/) for how to build; rules under [`.cursor/rules/`](.cursor/rules/) for hard constraints.
3. Schema changes start in `backend/src/db/types.ts`.
4. New HTTP mounts: `config.ts` + `routes.ts` (skill `backend-platform`).

## License / org

Aixel Labs (Pune). Domains referenced in-app: `aixellabs.in` / `app.aixellabs.in`.
This README describes an internal-style SaaS monorepo; adjust visibility before any public open-source release.
