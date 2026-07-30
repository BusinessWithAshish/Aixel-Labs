---
name: backend-utils
description: >-
  Shared backend scrape utilities under backend/src/utils (TLS/node-tls-client,
  Evomi proxy, fetch sessions, location Zod schemas, country codes, async helpers).
  Use when changing scraper I/O, proxy config, LOCATION_FIELDS_SCHEMA, or deciding
  whether to add a util vs module-local helper. Backend-only — not imported by the
  frontend and not exported from @aixellabs/backend.
---

# Backend utils (`backend/src/utils`)

Shared infrastructure for **API scrapers**. Not a product module and **not** used
by the frontend (no `@aixellabs/backend/utils` package export).

## Who uses what

| Consumer | How |
|----------|-----|
| `backend/src/api/**` | Relative imports (`../../utils/…`) |
| Frontend | **Never** — FE uses `@aixellabs/backend/config`, `db`, product schemas/types only |
| MCP | Indirectly via intelligence services that call TLS/utils |

## File map

| File | Role |
|------|------|
| `node-tls-client-session-handler.ts` | Primary HTTP: sessions, `fetchUrls`, `tlsGet`, sticky proxy, retries |
| `fetch-session-common.ts` | Shared options, `buildEvomiProxyUrl`, presets, retry/skip, timeouts |
| `constants.ts` | Browser timeouts + `PROXY_CONFIG` from `EVOMI_PROXY_*` (after `dotenv` in `server.ts`) |
| `location-schema.ts` | Shared Zod: `LOCATION_FIELDS_SCHEMA`, ISO country, state/city |
| `country.ts` | `toAlpha2CountryCode` for proxy `_country-XX` / Google `gl` |
| `async-helpers.ts` | `sleep`, `jitter`, `withTimeout`, header merge, `shortUrl` |
| `browser-worker.ts` | Optional remote Chrome via `BROWSER_WORKER_URL` — **no live api/ importers** today |
| `guerrilla-mail.ts` | Temp inbox helper — **no live importers** today |

## Default stack

Prefer **TLS + Evomi** (`PROXY_CONFIG` / sticky session / country) for new scrapers.
Do not invent Botasaurus/Playwright unless the module README already requires it
(see external `botasaurus` / `gcloud-run-functions` skills).

Location fields on lead APIs: compose `LOCATION_FIELDS_SCHEMA` from here — don’t
duplicate country/state/city Zod in each module.

## When to add a util vs keep local

| Put in `utils/` | Keep in module |
|-----------------|----------------|
| Reused by 2+ API modules | One-off parse/map for a single product |
| Proxy / TLS / geo primitives | Product-specific URL builders (module `constants`) |
| Generic async/retry helpers | Intelligence enrich math (`compute/`) |

Dead helpers (`browser-worker`, `guerrilla-mail`): don’t revive without a live
caller and a module README note.

## Env (read via utils / server)

| Var | Used by |
|-----|---------|
| `EVOMI_PROXY_*` | `PROXY_CONFIG` |
| `BROWSER_WORKER_URL` | `browser-worker.ts` |
| `FETCH_URLS_DEBUG_PROXY` | proxy debug |

`dotenv/config` must load in `server.ts` **before** modules that freeze env into
constants (platform skill).

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/utils.mdc` |
| API modules | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| Process / env boot | `.cursor/skills/backend/backend-platform/SKILL.md` |
| Botasaurus (when needed) | `.cursor/skills/external/botasaurus/SKILL.md` |
