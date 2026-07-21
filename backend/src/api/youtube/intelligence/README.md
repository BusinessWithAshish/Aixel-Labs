# YouTube Intelligence API

Derived endpoints that return **raw API responses + a nested `intelligence` block** of computed fields. Most resources enrich from the raw fetch alone; **search** and **channel** intelligence also batch-call video-meta (`get_watch`) to resolve absolute publish dates, durations, and channel subscriber counts where the raw harvest does not expose them.

## Routes

| Sub-API            | Method | Route                                      | Raw counterpart              |
| ------------------ | ------ | ------------------------------------------ | ---------------------------- |
| Search             | `POST` | `/youtube/intelligence/search`             | `/youtube/search`            |
| Video              | `POST` | `/youtube/intelligence/video`              | `/youtube/video`             |
| Video suggested    | `POST` | `/youtube/intelligence/video/suggested`    | `/youtube/video/suggested`   |
| Video transcript   | `POST` | `/youtube/intelligence/video/transcript`   | `/youtube/video/transcript`  |
| Suggest            | `POST` | `/youtube/intelligence/suggest`            | `/youtube/suggest`           |
| Channel            | `POST` | `/youtube/intelligence/channel`            | `/youtube/channel`           |
| Handle             | `POST` | `/youtube/intelligence/handle`             | `/youtube/handle`            |

Route paths live in `constants.ts` → `YOUTUBE_INTELLIGENCE_ROUTES` and are mirrored in `backend/src/config.ts` → `API_ENDPOINTS.YOUTUBE.INTELLIGENCE`.

## Response shape (Option A)

Every intelligence endpoint returns the **same top-level fields as the raw API**, plus:

```json
{
  "success": true,
  "data": {
    "...rawFields": "...",
    "intelligence": {
      "...computedFields": "..."
    }
  }
}
```

For list-shaped raw responses (e.g. search `items[]`, channel `items[]`), enrichment happens **per item** — each element gets its own `intelligence` block. Search and channel also attach a **top-level** `intelligence` block with aggregate metrics.

## Architecture

```
intelligence/
├── README.md                 # This file
├── index.ts                  # Route aggregator
├── constants.ts              # Routes, handler labels, thresholds, regex patterns
├── types.ts                  # WithIntelligence<T,I> + shared field building blocks
├── helpers.ts                # Re-exports math, distributions, watch-meta utilities
├── math.ts                   # mean/max/min, ratios, percentiles (simple-statistics + custom percentile)
├── distributions.ts          # Duration-bucket & channel-tier counters
├── watch-meta.ts             # EMPTY_YOUTUBE_VIDEO_WATCH_META, resolveWatchMeta
├── type-guards.ts            # Search/channel item shape guards
├── create-handler.ts         # DRY Express handler factory
├── compute/                  # Shared pure compute (single source of truth)
│   ├── time.ts               # publishedDaysAgo, channelAgeInDays
│   ├── velocity.ts           # viewsPerDay, velocityScore, publishing fields
│   ├── classification.ts     # durationBucket, channelTier, isShort
│   ├── engagement.ts         # like/comment ratios
│   ├── title.ts              # title length, word count, pattern flags
│   ├── text.ts               # description, hashtags, channel keywords
│   ├── ranking.ts            # rankOnChannel helper
│   └── index.ts
├── search/                   # handler → enrich → compute (search-specific)
├── video/                    # handler → enrich (imports shared compute/)
├── video/suggested/
├── suggest/                  # recursive keyword tree (depth 0+1, parallel)
├── transcript/               # zones / hook / CTA / keywords / title alignment
│   ├── schemas.ts            # extends raw transcript schema + optional title
│   ├── compute/              # zones, hook, cta, keywords, title-alignment, intro
│   ├── enrich.ts
│   ├── service.ts
│   └── handler.ts
├── channel/                  # handler → harvest → enrich → compute + content-metrics
├── handle/
└── video-meta/
```

Raw layer (`../search`, `../video`, etc.) remains the **single source of truth** for:

- Request validation schemas (`../{resource}/schemas.ts`)
- YouTube fetch logic (`../{resource}/helpers.ts` → `fetchYoutube*`)
- Normalized response types (`../{resource}/types.ts`)

Intelligence layer **must not** duplicate schemas, fetch, or geo/session logic.

## DRY rules

| Concern                  | Where it lives             | Intelligence layer                                   |
| ------------------------ | -------------------------- | ---------------------------------------------------- |
| Request body validation  | `../{resource}/schemas.ts` | Import & reuse                                       |
| YouTube scraping         | `../{resource}/helpers.ts` | Call `fetchYoutube*` directly (never HTTP loopback)  |
| Raw response types       | `../{resource}/types.ts`   | Extend via `WithIntelligence<Raw, Intel>`            |
| Handler boilerplate      | `create-handler.ts`        | One factory per resource                             |
| Thresholds & patterns    | `constants.ts`             | Derive bucket/tier logic from constants              |
| Shared computed fields   | `compute/`                 | Import — never reimplement                           |
| Shared field types       | `types.ts`                 | Compose resource types from building blocks          |
| Math / aggregates        | `math.ts`                  | `percentile`, percentiles, averages, ratios, dominant-map/record |
| Watch-meta defaults      | `watch-meta.ts`            | `EMPTY_YOUTUBE_VIDEO_WATCH_META`, `resolveWatchMeta` |
| Computed fields          | `{resource}/enrich.ts`     | Orchestration only — delegate to `compute/`          |
| Intelligence field types | `{resource}/types.ts`      | Compose from shared type building blocks             |

## Per-resource implementation checklist

When adding intelligence fields for a resource (e.g. video):

1. **`types.ts`** — Compose `*_INTELLIGENCE_FIELDS` from shared building blocks in `../types.ts`.
2. **`compute/`** — Add pure functions if the field is reusable across resources; otherwise keep resource-local logic in `{resource}/compute.ts`.
3. **`enrich.ts`** — Wire raw + watch-meta → compute functions. No inline math.
4. **`handler.ts`** — Should already be wired; only change if fetch orchestration differs.
5. **Tests** — Add unit tests for compute functions using fixture raw JSON (no HTTP).
6. **OpenAPI** — Extend `../openapi.json` with intelligence schemas when fields are finalized.

## Handler factory

`create-handler.ts` centralizes:

- Zod validation → 400
- `fetch` → `enrich` → 200
- Optional `mapError` for resource-specific errors (e.g. `YoutubeVideoError` → 404)

Handler labels live in `constants.ts` → `YOUTUBE_INTELLIGENCE_HANDLER_LABELS`.

Each resource handler is ~15 lines: import raw schema + fetch + enrich, pass to factory.

## Channel special case

Channel raw handler resolves `handle` → `channelId` before fetch. Intelligence channel handler reuses the same orchestration in its `fetch` callback and uses `harvest.ts` to fetch extra tabs (videos/shorts) for aggregate metrics.

## Rollout order

1. ✅ Scaffold folders, routes, factory, empty `intelligence: {}` placeholders
2. ✅ Video intelligence fields
3. ✅ Search intelligence fields (video items — see SKIPPED_FIELDS.md)
4. ✅ Channel intelligence fields (video tab items — see SKIPPED_FIELDS.md)
5. ✅ Video suggested intelligence fields
6. ✅ Handle intelligence fields
7. ✅ Suggest intelligence (niche keyword tree)
8. ✅ Transcript intelligence (zones, hooks, CTAs, title alignment)
9. ⬜ Unit tests per compute module
10. ⬜ OpenAPI documentation

## Deferred fields

See [SKIPPED_FIELDS.md](./SKIPPED_FIELDS.md) for fields blocked on missing raw data or extra harvest steps.

## Out of scope (for now)

- Caching raw responses for cheaper re-enrichment
- `/youtube/intelligence/v2/*` versioning (add only when breaking computed fields)
