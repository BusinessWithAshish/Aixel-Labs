# YouTube Intelligence API

Derived endpoints that return **raw API responses + a nested `intelligence` block** of computed fields. Most resources enrich from the raw fetch alone; **search** and **channel** intelligence also batch-call video-meta (`get_watch`) to resolve absolute publish dates, durations, and channel subscriber counts where the raw harvest does not expose them.

## Routes

| Sub-API | Method | Route                           | Raw counterpart    |
| ------- | ------ | ------------------------------- | ------------------ |
| Search  | `POST` | `/youtube/intelligence/search`  | `/youtube/search`  |
| Video   | `POST` | `/youtube/intelligence/video`   | `/youtube/video`   |
| Channel | `POST` | `/youtube/intelligence/channel` | `/youtube/channel` |
| Handle  | `POST` | `/youtube/intelligence/handle`  | `/youtube/handle`  |

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

For list-shaped raw responses (e.g. search `items[]`, channel `items[]`), enrichment happens **per item** — each element gets its own `intelligence` block.

## Architecture

```
intelligence/
├── README.md              # This file
├── index.ts               # Route aggregator
├── constants.ts           # INTELLIGENCE route paths only
├── types.ts               # Shared WithIntelligence<T, I> helper
├── create-handler.ts      # DRY Express handler factory
├── search/
│   ├── handler.ts         # Thin: schema + fetch + enrich wiring
│   ├── enrich.ts          # Compute + video-meta enrichment
│   └── types.ts           # Intelligence field types per resource
├── video/
├── channel/
└── handle/
```

Raw layer (`../search`, `../video`, etc.) remains the **single source of truth** for:

- Request validation schemas (`../{resource}/schemas.ts`)
- YouTube fetch logic (`../{resource}/helpers.ts` → `fetchYoutube*`)
- Normalized response types (`../{resource}/types.ts`)

Intelligence layer **must not** duplicate schemas, fetch, or geo/session logic.

## DRY rules

| Concern                  | Where it lives             | Intelligence layer                                  |
| ------------------------ | -------------------------- | --------------------------------------------------- |
| Request body validation  | `../{resource}/schemas.ts` | Import & reuse                                      |
| YouTube scraping         | `../{resource}/helpers.ts` | Call `fetchYoutube*` directly (never HTTP loopback) |
| Raw response types       | `../{resource}/types.ts`   | Extend via `WithIntelligence<Raw, Intel>`           |
| Handler boilerplate      | `create-handler.ts`        | One factory per resource                            |
| Computed fields          | `{resource}/enrich.ts`     | **Only place** intelligence logic is added          |
| Intelligence field types | `{resource}/types.ts`      | `*_INTELLIGENCE_FIELDS` + `*_INTELLIGENCE_RESPONSE` |

## Per-resource implementation checklist

When adding intelligence fields for a resource (e.g. video):

1. **`types.ts`** — Define `YOUTUBE_VIDEO_INTELLIGENCE_FIELDS` with each computed field and its type.
2. **`enrich.ts`** — Implement pure functions that derive those fields from raw data. Export `enrichVideoDetails(raw)` (or `enrichSearchItem`, etc.).
3. **`handler.ts`** — Should already be wired; only change if fetch orchestration differs (e.g. channel handle resolution).
4. **Tests** — Add unit tests for `enrich.ts` using fixture raw JSON (no HTTP).
5. **OpenAPI** — Extend `../openapi.json` with intelligence schemas when fields are finalized.

## Handler factory

`create-handler.ts` centralizes:

- Zod validation → 400
- `fetch` → `enrich` → 200
- Optional `mapError` for resource-specific errors (e.g. `YoutubeVideoError` → 404)

Each resource handler is ~15 lines: import raw schema + fetch + enrich, pass to factory.

## Channel special case

Channel raw handler resolves `handle` → `channelId` before fetch. Intelligence channel handler reuses the same orchestration in its `fetch` callback — logic is not duplicated in the factory, only in one `fetch` lambda shared pattern with raw handler.

## Rollout order

1. ✅ Scaffold folders, routes, factory, empty `intelligence: {}` placeholders
2. ✅ Video intelligence fields
3. ✅ Search intelligence fields (video items — see SKIPPED_FIELDS.md)
4. ✅ Channel intelligence fields (video tab items — see SKIPPED_FIELDS.md)
5. ⬜ Handle intelligence fields
6. ⬜ Unit tests per `enrich.ts`
7. ⬜ OpenAPI documentation

## Deferred fields

See [SKIPPED_FIELDS.md](./SKIPPED_FIELDS.md) for fields blocked on missing raw data or extra harvest steps.

## Out of scope (for now)

- Caching raw responses for cheaper re-enrichment
- `/youtube/intelligence/v2/*` versioning (add only when breaking computed fields)
