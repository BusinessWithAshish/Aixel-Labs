---
name: backend-api-module
description: >-
  Build or extend Express scraper APIs under backend/src/api (handler, Zod
  request schemas, response types, compute/client, config/routes wiring,
  package exports). Use when adding a new backend product API, editing
  facebook/gmaps/gsearch/instagram/linkedin/youtube/google-trends/website-contacts,
  or wiring request/response contracts for lead-gen. Schema/collections/LeadData
  SSOT is backend-db (backend/src/db) — not this skill. Not for Mongo CRUD I/O
  (frontend + backend/src/db) or Botasaurus/Cloud Run deploy (external skills).
---

# Backend API modules (`backend/src/api`)

How to develop HTTP scraper / compute APIs in this repo. **Not** one skill per
product folder — product specifics stay in each module’s `README.md`.

## Mental model (important)

```
HTTP POST  →  Zod safeParse  →  client/helpers (+ compute)  →  ALApiResponse<data>
```

| Layer | Owns | Does **not** own |
|-------|------|------------------|
| `backend/src/api/**` | Scrape / fetch / enrich; Zod request; response **types** | Mongo reads/writes, credits debit |
| `backend/src/db/**` | **Schema SSOT** — Doc types, `LeadData`, modules, Mongo client | Scraping |
| Frontend | `createUserLeads`, credits, lead lists (I/O) | BE scrape internals; parallel Doc types |

API handlers **must not** import `getCollection` / `mongo-client`. Persistence
happens after a successful scrape on the frontend. Lead-shaped APIs still
expose a stable `id` on each item so FE can store it as `sourceId`.

Schema / collection / `LeadData` changes: follow `.cursor/skills/backend/backend-db/SKILL.md`
**before** FE wiring — do not invent types only on the frontend.

Envelope (all handlers):

```ts
// backend/src/api/types.ts
type ALApiResponse<T> = { success: boolean; error?: string; data?: T };
```

## Canonical module to mirror

| Need | Mirror |
|------|--------|
| Single POST lead/scrape API (preferred default) | `backend/src/api/website-contacts/` |
| Lead scrape + discovery branches | `backend/src/api/facebook/` |
| Multi-route family + handler factory | `backend/src/api/youtube/` (+ `create-handler.ts`) |
| Raw + intelligence overlay / MCP | `youtube/intelligence`, `google-trends` — follow those READMEs; keep HTTP services reusable for MCP |

## Module layout

```
backend/src/api/<module>/
├── index.ts          # Router + public re-exports (schemas, types, constants, fetch)
├── handler.ts        # thin: parse → call client → ALApiResponse
├── schemas.ts        # Zod REQUEST only (*_REQUEST_SCHEMA)
├── types.ts          # z.infer request + hand-written RESPONSE types
├── constants.ts      # limits, enums, error messages, field descriptions, routes
├── client.ts         # orchestration / batch / concurrency (or helpers.ts)
├── helpers.ts        # optional fetch/map glue
├── compute/          # pure transforms (no I/O)
└── README.md         # request/response contract + smoke commands
```

Multi-sub-API modules (`youtube`, `gmaps`, `instagram`, `google-trends`): parent
`index.ts` aggregates `register*Routes(router)`; each subfolder owns its own
handler/schemas when large enough.

## Request schemas (Zod)

- **Name:** `{MODULE}_REQUEST_SCHEMA` (e.g. `WEBSITE_CONTACTS_REQUEST_SCHEMA`).
- **Validate in handler:** `schema.safeParse(req.body)` — not Express middleware.
- **Limits / defaults:** read from `constants.ts` (SSOT), not magic numbers in Zod.
- **`.describe(...)`** on fields (MCP + docs). Prefer description strings in constants.
- **Shared fragments:** geo → YouTube parent schemas; location → `backend/src/utils/location-schema.ts`.
- **Request types:** `z.infer` / `z.input` / `z.output` in `types.ts`.
- **No response Zod** in this tree — response shapes are TypeScript types only.

400 on invalid body:

```ts
res.status(400).json({
  success: false,
  error: MODULE_ERROR_MESSAGES.INVALID_PARAMS,
} satisfies ALApiResponse<never>);
```

## Response types

- Hand-written in `types.ts` as `{MODULE}_RESPONSE` (or per-variant names).
- Product **lead** APIs return `ALApiResponse<LeadItem[]>` where each item has
  **`id: string`** (stable source id). Do not invent a FE mapper that unwraps a
  different envelope — see `frontend-business-lead-generation`.
- Put `id` on the response type itself (see `FACEBOOK_RESPONSE`,
  `WEBSITE_CONTACTS_RESPONSE`).
- Nested enrichments (YouTube/Trends intelligence) keep raw fields and add an
  `intelligence` object — follow those modules; do not invent a second envelope.

### Link to Mongo / `LeadData` (contract only)

When a new lead product API ships:

1. Response type with `id` lives under `api/<module>/types.ts`.
2. Extend `LeadData` + `LeadSource` + `LEAD_GENERATION_SUB_MODULES` in
   `backend/src/db/types.ts` (**schema SSOT** — `backend-db` skill).
3. FE wires `lead-gen-api.ts` + submodule + `createUserLeads` (frontend skill).

`LeadDoc.data` stores that JSON; scrapers never write it.

## Handler rules

- Prefer **thin** handlers (website-contacts / facebook style).
- Multi-route families may use `create*Handler({ schema, fetch })` factories
  (`youtube/create-handler.ts`, `google-trends/create-handler.ts`).
- Status codes: `400` validation, `200` success, `500` unexpected; use module
  upstream codes (`403`/`429`/`502`) only when the existing module already does.
- Batch scrapers: prefer per-item failure in the result array over failing the
  whole batch (website-contacts pattern).

## Client / compute / I/O

| Concern | Where |
|---------|--------|
| Batch + concurrency | `client.ts` — reuse `runWithConcurrency` patterns (youtube / website-contacts) |
| Pure parse/map/score | `compute/` — no network |
| TLS + Evomi / location Zod / proxy | **`backend-utils`** — `.cursor/skills/backend/backend-utils/SKILL.md` |
| Cross-module discovery | Call sibling **services** (e.g. facebook → gsearch), not HTTP loopback |

Do not pull Botasaurus / Playwright into a module unless that module’s README
already requires it — default stack is TLS client + proxy (`backend-utils`).

## Wire-up checklist (new HTTP API)

1. Create `backend/src/api/<module>/` with layout above + README.
2. Mount via **platform** skill: `ENDPOINTS` + `API_ENDPOINTS` in `config.ts`, then `app.use` in `routes.ts` (`.cursor/skills/backend/backend-platform/SKILL.md`).
3. `Router().post(API_ENDPOINTS.…route, handler)` in module `index.ts`.
4. Export schemas/types/constants from `backend/package.json` `exports` when the
   frontend (or NL chat) needs them (`@aixellabs/backend/<module>`).
5. If lead product: update `LeadData` / `LeadSource` / submodules via **`backend-db`**, then FE lead-gen checklist.
6. Optional MCP tool: **`backend-mcp`** skill — same service as HTTP, no loopback.

## Package export pattern

```json
"./website-contacts": { "types": "./src/api/website-contacts/index.ts", "default": "…" },
"./website-contacts/schemas": { … },
"./website-contacts/types": { … },
"./website-contacts/constants": { … }
```

Re-export from `index.ts` what consumers need; keep heavy scrape code importable
only from server-side FE paths.

## Related skills / rules

| Concern | Path |
|---------|------|
| Governor (hard rules) | `.cursor/rules/backend/api.mdc` |
| Platform (`config` / `routes` / `server`) | `.cursor/skills/backend/backend-platform/SKILL.md` |
| Utils (TLS / proxy / location) | `.cursor/skills/backend/backend-utils/SKILL.md` |
| MCP tools | `.cursor/skills/backend/backend-mcp/SKILL.md` |
| DB schema SSOT | `.cursor/skills/backend/backend-db/SKILL.md` |
| FE lead forms + debit | `.cursor/skills/frontend/business/frontend-business-lead-generation/SKILL.md` |
| Botasaurus (when used) | `.cursor/skills/external/botasaurus/SKILL.md` |
| Cloud Run Functions | `.cursor/skills/external/gcloud-run-functions/SKILL.md` |
| DRY cleanup | `.cursor/skills/common/dry-module-cleanup/SKILL.md` |

## Do / don’t

- DO keep constants as SSOT for limits and error strings.
- DO document request/response in the module `README.md`.
- DO keep handlers free of business Mongo.
- DON’T add `*_RESPONSE_SCHEMA` Zod unless a concrete consumer requires it.
- DON’T register routes only in the module — always `config` + `routes.ts` (**platform** skill).
- DON’T put product-specific scrape recipes in this skill — use the module README.
