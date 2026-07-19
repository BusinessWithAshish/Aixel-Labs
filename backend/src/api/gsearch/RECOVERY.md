# Google Search API — Recovery & Rebuild Playbook

**Purpose:** If `POST /gsearch` suddenly stops returning results, this doc lets an AI
agent (or engineer) diagnose the break and rebuild a working browserless Google SERP
path from first principles — with exact references, code, and fallbacks.

**Last verified working:** July 8, 2026 (120 results/query, US/GB/IN, city targeting, proxied).

---

## 1. TL;DR of the current solution

- We do **not** scrape `www.google.com/search` (gated by the **knitsail / SG_SS** JS
  challenge — unsolvable by any HTTP client; see `experiments/google-search/FINDINGS.md`).
- We call the **Google Custom Search Element** endpoint (`cse.google.com/cse/element/v1`),
  a JSONP AJAX API meant for embeddable "Programmable Search" widgets.
- Two proxied GETs: `cse.js` (token) → `element/v1` (results). Public `cx` from blackle.com.
- Hard ceiling **~120 results/query** (`start` maxes at 100). **1000 results is impossible**
  via this endpoint — it's Google's CSE limit, same as the official CSE JSON API's 100-cap.
- Implemented in `backend/src/api/gsearch/`. Discovered from SearXNG's `google_cse` engine.

---

## 2. How to detect WHAT broke (run these first)

```bash
cd backend

# A. Is the whole endpoint dead, or just our code?
curl -sL "https://cse.google.com/cse.js?cx=partner-pub-8993703457585266:4862972284" \
  -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" \
  | tail -c 600            # → should contain "cse_token" + "cselibVersion"

# B. End-to-end fetch layer (through proxy)
pnpm exec tsx scripts/gsearch-api-smoke.ts

# C. Pagination ceiling (is start>100 still blocked? did num change?)
pnpm exec tsx scripts/gsearch-ceiling-probe.ts
```

**Failure signatures → cause:**

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `cse.js` has no `cse_token` blob | Google changed the token bootstrap format | Re-derive parser (§4.1); check `cse.js` shape |
| Element returns `error.code: 429` JSON | Proxy IP rate-limited | Rotate Evomi session/country; add backoff |
| Element returns `<title>Sorry…` HTML | IP burned OR `cx` disabled | Rotate IP; if persists, `cx` may be dead → §4.2 |
| Empty `results[]` on page 1 for any query | `cx` deprecated / endpoint changed | Get a new public `cx` (§4.2) or go to fallback ladder (§5) |
| 403 from our API | Evomi creds missing | Set `EVOMI_PROXY_*` env |
| Everything 200 but 0 results everywhere | **CSE endpoint killed by Google** (expected ~2027) | Go to fallback ladder (§5) |

---

## 3. Canonical references (READ THESE to rebuild)

### Primary — SearXNG (the source of this technique)

| What | URL | Why it matters |
|------|-----|----------------|
| **`google_cse` engine source** | https://github.com/searxng/searxng/blob/master/searx/engines/google_cse.py | The exact reference implementation we ported. Token parse + request params + response parse. |
| PR #6364 — add google cse engine | https://github.com/searxng/searxng/pull/6364 | Origin of the CSE approach (merged Jul 5 2026). Blackle.com `cx`, time-range via `sort`, 20/page. |
| PR #6366 — remove GSA user-agents | https://github.com/searxng/searxng/pull/6366 | Confirms the HTML `/search` engine is dead; CSE is the replacement. |
| PR #6369 — cse images support | https://github.com/searxng/searxng/pull/6369 | How to extend CSE to image results (`searchtype=image`). |
| Issue #6359 — GSA iPhone UA patched | https://github.com/searxng/searxng/issues/6359 | Why the old UA tricks no longer work. |
| Issue #5286 — google engine broken (knitsail) | https://github.com/searxng/searxng/issues/5286 | Full history of SG_SS/knitsail, `asearch=arc`, consent/NID cookies, UA tricks. |
| Issue #5867 — HTTP 403 | https://github.com/searxng/searxng/issues/5867 | Android "Google App" UA fix era (PR #5892). |

### Secondary — knitsail / SG_SS internals (only if attempting HTML `/search` again)

| What | URL |
|------|-----|
| SerpBase: knitsail & SG_SS generation logic | https://serpbase.dev/blog/google-knitsail-and-sg-ss-generation-logic-and-its-role-in-distinguishing-automa |
| mat-1 metasearch2 PR #31 (Node SG_SS attempt, 429'd) | https://github.com/mat-1/metasearch2/pull/31 |
| SearXNG #5286 comment — SG_SS `S(a)` cookie snippet | https://github.com/searxng/searxng/issues/5286#issuecomment-3424376167 |
| NewPipe `SOCS=CAISAiAD` consent cookie | https://github.com/TeamNewPipe/NewPipeExtractor (YoutubeParsingHelper) |

### Alternatives / context

| What | URL |
|------|-----|
| 4get (working Google engine, self-host) | https://github.com/cra88y/4get-hijacked (searxng adapter) |
| Scraping Google 2026 overview | https://blog.scrapeup.com/scraping-google-search-2026/ |
| Our own research | `backend/src/experiments/google-search/FINDINGS.md`, `README.md`, `TRANSPORT_COMPARISON.md` |

---

## 4. Rebuild the CURRENT solution from scratch

### 4.1 The two requests (copy-paste, no deps)

```bash
CX="partner-pub-8993703457585266:4862972284"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# 1) Token — parse the trailing  ({ ... });  blob for cse_token + cselibVersion
curl -sL "https://cse.google.com/cse.js?cx=$CX" -H "User-Agent: $UA"

# 2) Search (JSONP)  →  /*O_o*/ _({ "cursor": {...}, "results": [...] })
curl -s "https://cse.google.com/cse/element/v1?rsz=filtered_cse&num=20&hl=en\
&cselibv=<CSELIBVERSION>&cx=$CX&q=<QUERY>&safe=off&cse_tok=<CSE_TOKEN>\
&callback=_&rurl=&searchtype=&exp=cc,sps,dpawabp&gl=us&start=0" \
  -H "User-Agent: $UA" -H "Referer: https://cse.google.com/"
```

Key request params:
- `q` — query. For city targeting, append location text: `"<q> in <City, State>"` (uule/near are IGNORED here).
- `gl` — 2-letter country (lowercase). Localizes TLDs (`.com`/`.co.uk`/`.co.in`).
- `num` — 20 (max). `start` — 0,20,40,…,100 (max 100 → ~120 results total).
- `safe` — off|medium|high. `hl` — language.
- `sort=date:r:YYYYMMDD:YYYYMMDD` — time range (there is NO `tbs` here).
- `cse_tok`, `cselibv`, `exp` — from step 1. Token valid ~1h, tied to `cx` (not IP).

### 4.2 If the `cx` is dead — get a fresh public one

The `cx` is a public Programmable Search Engine id. To find another that searches the
whole web: search GitHub / the web for `cse.google.com/cse.js?cx=partner-pub-` or
`cx=` in SearXNG's `google_cse.py` (they update it). Or create your own at
https://programmablesearchengine.google.com/ ("Search the entire web" ON) and read its
`cx`. Update `GSEARCH_DEFAULT_CX` in `constants.ts`.

### 4.3 Response parsing (JSONP)

- Strip wrapper: take substring from first `{` to last `}`, `JSON.parse`.
- Results at `.results[]`; total at `.cursor.estimatedResultCount`.
- Per-result useful fields: `unescapedUrl`, `visibleUrl`, `titleNoFormatting`,
  `contentNoFormatting`, `formattedUrl`, `clicktrackUrl`, and `richSnippet.{cseThumbnail,
  cseImage, metatags, person, videoobject}`. Enrichment mapping lives in `helpers.ts`
  → `mapCseResult` (og/twitter meta, published/modified time, author, keywords, video).

### 4.4 Our module layout (what to recreate)

```
backend/src/api/gsearch/
  constants.ts  # cx, URLs, GSEARCH_PAGE_SIZE=20, GSEARCH_MAX_PAGES=6, GSEARCH_MAX_START=100, enums
  schemas.ts    # zod: searchQuery, country(req), region?, pages, language, safe, timeFilter
  types.ts      # GsearchResult (enriched), GsearchResponse, GsearchToken
  helpers.ts    # buildLocationQuery, buildTimeSort, parseCseJsToken, parseJsonp, mapCseResult
  client.ts     # fetchGsearch: token cache + proxied paginated loop (always Evomi)
  handler.ts    # Express: 403 if no proxy → parse → fetch → ALApiResponse
  index.ts      # Router (POST /) + registered in routes.ts + config.ts (ENDPOINTS.GSEARCH)
```

Proxy: always on via `buildEvomiProxyUrl({ sessionId, countryCode })` (country only —
`_region-*` fails the tunnel for unsupported cities). Transport: `node-tls-client` (`chrome_131`).

---

## 5. Fallback ladder (when CSE element endpoint is fully dead)

Try in order; each is a distinct browserless-ish strategy. Full research context in
`experiments/google-search/FINDINGS.md`.

1. **New public `cx` / self-hosted CSE** (§4.2). Cheapest fix; usually the endpoint code
   is fine and only the `cx` rotated. Check SearXNG `google_cse.py` first.

2. **Official Google Custom Search JSON API** —
   `https://www.googleapis.com/customsearch/v1?key=<API_KEY>&cx=<CX>&q=<q>`.
   100 queries/day free, then paid. Same 100-result cap. Fully sanctioned, most stable.
   Requires API key + billing (prior blocker was an invalid key — set up billing).

3. **Watch SearXNG's `google.py` / `google_cse.py`** for the community's next bypass and
   port it. They fix Google breakage within days historically (see issue timeline §3).
   Mirror their UA / cookie / param changes.

4. **4get engine** (https://github.com/cra88y/4get-hijacked) — an actively maintained
   Google scraper; can be run as a sidecar and queried over HTTP.

5. **browser-worker (real Chrome + stealth + Evomi)** — `browser-worker/src/handlers/
   gsearch/`. This DOES get the full HTML SERP (incl. PAA/AI Overview) when the IP is
   clean. Slower, heavier, but the most durable. Use for full SERP features regardless.

6. **HTML `/search` + SG_SS** — only if someone publishes a real knitsail deobfuscator
   (mat-1 was WIP, not done as of 2026). jsdom/Node-VM tokens are REJECTED (429). Do NOT
   sink time here without a published solver. See FINDINGS.md "Why VM-generated SG_SS fails".

7. **Third-party SERP APIs** (Serper.dev, ScrapeUp, SerpApi, Browserless /unblock) — paid,
   but drop-in if in-house paths all die and time-to-restore matters.

---

## 6. Known limits & invariants (don't re-test from zero)

- **~120 results max per query** (`start` ≤ 100). Verified with clean per-request IPs, so
  it's a Google ceiling, not rate limiting. 1000 is not achievable on this endpoint.
- **UA-independent**: desktop vs mobile UA → identical results. It's an API, not a SERP.
- **Results ≈ organic google.com but not identical** (Programmable Search ranking).
- **uule / near ignored**; location = query text + `gl` + country proxy.
- **Token** ~1h TTL, per `cx`, not IP-bound (safe to cache/share across requests).
- **Rate limits** exist (429 JSON / Sorry HTML) — rotate Evomi session + country, backoff.
- **Deprecation risk**: SearXNG expects Google to kill the free CSE element endpoint
  ~2027. When it happens, symptom = 200 responses with empty results everywhere → §5.

---

## 7. Change log

| Date | Event |
|------|-------|
| 2026-07-05 | SearXNG merges `google_cse` engine (PR #6364); removes GSA UAs (#6366). |
| 2026-07-08 | Ported to `backend/src/api/gsearch/`. Verified 120 results, city targeting, enrichment, proxied. Ceiling confirmed `start`≤100. |
