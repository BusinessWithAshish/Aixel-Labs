# Google Trends API

Returns Google Trends data via two raw surfaces plus intelligence layers on top.

## Endpoints

| Method | Route | Config key | Notes |
| ------ | ----- | ---------- | ----- |
| `POST` | `/google-trends/trending` | `API_ENDPOINTS.GOOGLE_TRENDS.TRENDING` | Trending Now SSR scrape |
| `POST` | `/google-trends/interest` | `API_ENDPOINTS.GOOGLE_TRENDS.INTEREST` | Interest-over-time + related + geo |
| `POST` | `/google-trends/intelligence/interest` | `API_ENDPOINTS.GOOGLE_TRENDS.INTELLIGENCE_INTEREST` | Single-query intelligence |
| `POST` | `/google-trends/intelligence/compare` | `API_ENDPOINTS.GOOGLE_TRENDS.INTELLIGENCE_COMPARE` | Multi-query comparison intelligence |

## Trending Now (raw)

Validated by `schemas.ts` → `GOOGLE_TRENDS_REQUEST_SCHEMA`.

| Field | Type | Default | Notes |
| ----- | ---- | ------- | ----- |
| `geo` | `string` | `"US"` | 2-letter ISO country code |
| `hl` | `string` | `"en"` | BCP-47 language code |
| `hours` | `number` | `24` | One of `4`, `24`, `48`, `168` |
| `category` | `number` | `0` | Category ID (`0` = all) |
| `sort` | `string` | `"relevance"` | `relevance` / `volume` / `started` |
| `status` | `string` | `"all"` | `all` / `trending` / `started` |
| `limit` | `number` | `500` | Max entries (max `5000`) |

Fetches `https://trends.google.com/trending?geo=…&hl=…&hours=…`, parses the SSR
`AF_initDataCallback` `ds:0` block, then applies category/status/sort/limit as
post-processing.

## Interest over time (raw)

Under `./interest/`. Calls `/trends/api/explore` for widget tokens, then fetches
`TIMESERIES`, `RELATED_QUERIES`, and `GEO_MAP` widgetdata in parallel. Supports
single-keyword (`GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA`) and multi-keyword
compare (`GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA`, 2–5 keywords). Breakout rising
queries store `growth: null` and `isBreakout: true`.

## Intelligence

Under `./intelligence/`. Reuses raw interest fetchers; adds a nested
`intelligence` block (same Option A shape as YouTube intelligence).

- **Single** (`single/`) — direction, lifecycle, seasonality, breakouts,
  platform comparison (web↔YouTube), geo concentration, rising top-N.
- **Compare** (`compare/`) — per-query direction/lifecycle, dominance ranking,
  momentum ranking, crossover points.

## Folder layout (DRY)

| Concern | Location |
| ------- | -------- |
| Routes, labels, maps, query params, HTML markers, headers | `./constants.ts` |
| Trending Now types / schema / URL / parse / filter / helpers | `./types.ts`, `./schemas.ts`, `./url.ts`, `./parse/`, `./filter.ts`, `./helpers.ts` |
| Interest-over-time raw API | `./interest/` (`schemas`, `types`, `url`, `parse`, `fetch`, `helpers`, `handler`) |
| Interest/compare intelligence | `./intelligence/` (`constants`, `types`, `compute/*`, `single/`, `compare/`) |
| Handler factory + route registration | `./create-handler.ts`, `./index.ts` |

### Interest intelligence compute (SSOT)

```
intelligence/compute/
├── series.ts       # extractSeries, slope, consistency, average
├── lifecycle.ts    # trend direction + lifecycle stage
├── seasonal.ts     # seasonal pattern detection
├── related.ts      # breakouts + rising top-N
├── platform.ts     # web vs YouTube demand gap
├── geo.ts          # geographic concentration
├── momentum.ts     # recent-slope momentum scores
├── crossover.ts    # multi-query line crossovers
└── index.ts        # barrel re-exports
```

Thresholds live in `intelligence/constants.ts`. Routes/labels for intelligence
endpoints live in parent `./constants.ts` → `GOOGLE_TRENDS_API_ROUTES` /
`GOOGLE_TRENDS_HANDLER_LABELS` (single source of truth — do not duplicate).

### Adding a new trending-now field

1. Add the constant / enum value in `constants.ts`.
2. Extend the raw tuple / parsed type in `types.ts`.
3. Map it in `parse/map-entry.ts`.
4. If it is a request filter, add a Zod field in `schemas.ts` and wire it in `filter.ts` + `helpers.ts`.

## Smoke test

```bash
pnpm exec tsx scripts/google-trends-api-smoke.ts
```

Network-dependent: requires direct or Evomi-proxied access to `trends.google.com`.
