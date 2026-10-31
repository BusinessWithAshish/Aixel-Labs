# Crawl (`POST /crawl`)

Sync TLS crawl that turns company **domains / website URLs** into published
contact profiles: emails, phones, socials, light meta/address.

Uses `node-tls-client` + Evomi only — **no** Puppeteer, Botasaurus, or
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

`maxPages` counts pages kept. Fetches per domain stop at `maxPages` + the
well-known paths, however many links fail, and a site that fails a whole first
batch is dropped. Only the first `MAX_HTML_CHARS` of a page is parsed, because
the parser runs on the main thread. The download itself cannot be capped:
`node-tls-client` buffers the whole body, up to the 15 s timeout.

## Response — `ALApiResponse<CRAWL_RESPONSE[]>`

One item per input domain. `id` is a stable hash of the registrable domain
(for `createUserLeads` / `sourceId`).

## Smoke

```bash
cd backend && pnpm exec tsx scripts/crawl-smoke.ts
cd backend && pnpm exec tsx scripts/crawl-batch-smoke.ts
```

Also reachable via the `crawl` MCP tool, op `scrape` (`scrapeCrawl` in
`client.ts`) — same service, no HTTP loopback.
