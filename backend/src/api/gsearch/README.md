# Google Search (web) API

Browserless organic **google.com web results** — no Puppeteer/Playwright, no TLS
knitsail/SG_SS solving. One `POST /gsearch` endpoint. Every request is routed through
the Evomi residential proxy (country-targeted; region best-effort).

This is the **productionized** version of the research in
`backend/src/experiments/google-search/` (see its `FINDINGS.md`). It mirrors the
`browser-worker` `gsearch` handler's request shape but fetches results over HTTP.

## How it works (source of truth)

Google's HTML `www.google.com/search` is gated behind the **knitsail / SG_SS** JS
challenge and cannot be scraped by any HTTP client. Instead we use the **Google Custom
Search Element** endpoint — the same route SearXNG adopted on **Jul 5, 2026**
(`google_cse` engine, [PR #6364](https://github.com/searxng/searxng/pull/6364)) after
abandoning the HTML scraper ([PR #6366](https://github.com/searxng/searxng/pull/6366)).

Two plain HTTP GETs (both proxied):

1. `GET https://cse.google.com/cse.js?cx=<cx>` → parse trailing `({…})` blob for
   `cse_token` + `cselibVersion` (token valid ~1h, cached per `cx`, not IP-bound).
2. `GET https://cse.google.com/cse/element/v1?…&q=<query>&cse_tok=<token>&callback=_`
   → JSONP with up to 20 structured results per page.

`cx` defaults to the public blackle.com id (`partner-pub-8993703457585266:4862972284`)
that searches the whole web.

### Desktop or mobile?

**Neither.** The endpoint is User-Agent-independent (verified: desktop Chrome and iPhone
Safari UAs return the same results). It serves Google's **Programmable/Custom Search
index**, drawn from the same web index as google.com but ranked by the CSE engine — so
results are **close to but not byte-identical** to organic `google.com/search`.

### Location targeting

| Signal | Honored by CSE element? | How we use it |
|--------|-------------------------|---------------|
| Country (`gl` + proxy `_country-XX`) | ✅ | From required `country` |
| Query text `"<q> in <region>"` | ✅ (reliable city signal) | From optional `region` |
| `uule` | ❌ ignored | not used |
| `near` | ❌ ignored | not used |
| Proxy `_region-*` | limited Evomi coverage | best-effort from `region` |

City/region precision is achieved by appending the location to the query text (the same
trick `browser-worker` uses) plus country proxy routing. `uule`/`near` are silently
ignored by this endpoint.

## Request — `POST /gsearch`

```jsonc
{
  "searchQuery": "emergency plumber",   // required
  "country": "US",                       // required — ISO 3166-1 alpha-2
  "region": "Austin, Texas",             // optional — city/state (appended to query)
  "pages": 1,                            // optional — 1..6, 20 results/page (~120 max, default 1)
  "language": "en",                      // optional — hl (default "en")
  "safe": "off",                         // optional — off | medium | high (default off)
  "timeFilter": "week"                   // optional — day | week | month | year
}
```

Schema: `schemas.ts` → `GSEARCH_REQUEST_SCHEMA`. Constants/limits: `constants.ts`.

## Response — `ALApiResponse<GsearchResponse>`

```jsonc
{
  "success": true,
  "data": {
    "query": "emergency plumber",
    "resolvedQuery": "emergency plumber in Austin, Texas",
    "country": "US",
    "region": "Austin, Texas",
    "language": "en",
    "estimatedResultCount": "13400000",
    "pagesFetched": 1,
    "results": [
      {
        "index": 1,
        "title": "…",
        "url": "https://…",
        "displayUrl": "example.com",
        "snippet": "…",
        "thumbnail": "https://encrypted-tbn0.gstatic.com/…",
        "image": "https://example.com/hero.jpg",
        "siteName": "Example",
        "metaDescription": "…",
        "modifiedTime": "2026-07-07T14:53:11+00:00"
      }
    ]
  }
}
```

### Fields beyond the browser-worker `{url,title,snippet,index}`

`displayUrl`, `thumbnail`, `image`, `siteName`, `metaDescription`, `modifiedTime` — all
extracted from the CSE result's `visibleUrl` and `richSnippet` (OpenGraph metatags). The
raw endpoint also returns `formattedUrl`, `clicktrackUrl`, `breadcrumbUrl`, and more
metatags; add them to `mapCseResult` in `helpers.ts` if needed.

## Architecture

```
gsearch/
├── index.ts       # Router (POST /) + public fetchGsearch export
├── constants.ts   # cx, URLs, limits, safe/time enums, UA, timeouts
├── schemas.ts     # GSEARCH_REQUEST_SCHEMA (country required, region optional)
├── types.ts       # GsearchResult, GsearchResponse, GsearchToken
├── helpers.ts     # location query, time→sort, JSONP parse, result mapping
├── client.ts      # token fetch/cache + paginated proxied search (fetchGsearch)
└── handler.ts     # Express handler (403 if no proxy, parse → fetch → respond)
```

## Notes & limits

- **~120 results max per query.** Google caps the CSE `start` offset at 100, so with
  `num=20` you get 6 pages × 20 ≈ **120 results** — then `start=120+` returns a "Sorry"
  page even from clean IPs. This is a hard Google limit (same as the official CSE JSON
  API's 100-result cap). **1000 results in a single query is not achievable** on this
  endpoint; `pages` is capped at 6.
- **Always proxied.** Returns `403` if Evomi env creds are missing. Proxy is routed by
  **country only** (Evomi `_region-*` fails the tunnel for unsupported cities — city
  precision comes from the query text instead).
- **Rate limits.** The endpoint returns a JSON `error` (often code 429) when the proxy IP
  is throttled — surfaced as HTTP 429. Rotate the proxy session / retry later. Pagination
  is resilient: a mid-pagination failure returns the results gathered so far.
- **Longevity.** Google may deprecate the free CSE element endpoint (~2027 per SearXNG).
  If it dies, see **[`RECOVERY.md`](./RECOVERY.md)** — a full diagnose-and-rebuild playbook
  with references, code snippets, and a fallback ladder.
- **Web only.** No AI Overview, People-Also-Ask, images, maps, or knowledge panel — use
  `browser-worker/src/handlers/gsearch` for full SERP features.

## If this breaks

Read **[`RECOVERY.md`](./RECOVERY.md)**. It has failure-signature diagnosis, the exact
two requests, all SearXNG/knitsail references, and an ordered fallback ladder (new `cx` →
official CSE JSON API → SearXNG's next fix → 4get → browser-worker → paid SERP APIs).
