# Crawl (`POST /crawl`)

Sync TLS crawl that turns company **domains / website URLs** into published
contact profiles: emails, phones, socials, light meta/address.

Uses `node-tls-client` + Evomi only — **no** browser-worker, Botasaurus, or
Playwright. Per-domain failures return an empty profile with `status`; the
batch does not fail.

## Request

```jsonc
{
  "domains": ["acme.com", "https://acme.com/about"], // 1..50
  "maxPages": 15, // optional
  "maxDepth": 2, // optional
  "thorough": false, // optional
}
```

Schema: `schemas.ts` → `CRAWL_REQUEST_SCHEMA`.
Limits: `constants.ts` → `CRAWL`.

## Response — `ALApiResponse<CRAWL_RESPONSE[]>`

One item per input domain. `id` is a stable hash of the registrable domain
(for `createUserLeads` / `sourceId`).

## Smoke

```bash
cd backend && pnpm exec tsx scripts/crawl-smoke.ts
cd backend && pnpm exec tsx scripts/crawl-batch-smoke.ts
```
