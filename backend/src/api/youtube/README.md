# YouTube API module

Express router mounting scraper sub-APIs under `/youtube`. All endpoints use **POST** and share geo fields. All scrape YouTube without the official Data API.

## Route registration

`index.ts` registers, in order:

| Sub-API | README | Method | Route |
|---------|--------|--------|-------|
| Search | [search/README.md](./search/README.md) | `POST` | `/search` |
| Video | [video/README.md](./video/README.md) | `POST` | `/video`, `/video/suggested` |
| Video meta | — | `POST` | `/video-meta` |
| Handle | — | `POST` | `/handle` |
| Channel | [channel/README.md](./channel/README.md) | `POST` | `/channel` |
| Intelligence | [intelligence/README.md](./intelligence/README.md) | `POST` | `/intelligence/*` |

Raw routes: `constants.ts` → `YOUTUBE_API_ROUTES`. Intelligence routes: `intelligence/constants.ts` → `YOUTUBE_INTELLIGENCE_ROUTES`. Both mirrored in `backend/src/config.ts` → `API_ENDPOINTS.YOUTUBE`.

## Shared request fields (every API)

Defined in `schemas.ts` → `YOUTUBE_GEO_REQUEST_SCHEMA`:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | 2-letter ISO 3166-1 alpha-2. Drives Evomi `_country-XX` proxy routing and InnerTube `gl`. |
| `region` | `string` | — | Optional. Drives Evomi `_region-*` proxy routing only — not sent to YouTube. |

## Architecture

```
youtube/
├── index.ts                  # Router aggregator
├── constants.ts              # Base URL, routes, limits, InnerTube config, handler labels
├── schemas.ts                # Shared geo + ID schemas + youtubeLimitSchema()
├── types.ts                  # Shared renderer shapes, geo request, watch-meta block
├── helpers.ts                # Parsers, geo session, InnerTube utilities
├── create-handler.ts         # Express handler factory (parse → fetch → respond)
├── type-guards.ts            # Shared InnerTube renderer guards
├── innertube-continuation.ts # Continuation token extraction (flat + nested)
├── concurrency.ts            # runWithConcurrency for batch scrapers
├── search/
├── video/
│   ├── errors.ts             # YoutubeVideoError
│   ├── get-watch.ts          # get_watch fetch + field extractors
│   ├── suggested.ts          # Suggested videos pagination
│   └── helpers.ts            # Public fetch API + re-exports
├── video-meta/
├── handle/
├── channel/
└── intelligence/             # Derived endpoints (separate DRY layout)
```

## Single source of truth

| Concern | Canonical location |
|---------|-------------------|
| Routes | `constants.ts` → `YOUTUBE_API_ROUTES` |
| Handler log/error labels | `constants.ts` → `YOUTUBE_HANDLER_LABELS` |
| URL builders | `constants.ts` → `YOUTUBE_VIDEO_URL`, `YOUTUBE_CHANNEL_PAGE_URL`, etc. |
| Renderer enum strings | `constants.ts` → `YOUTUBE_BADGE_STYLES`, `YOUTUBE_LOCKUP_CONTENT_TYPES` |
| Default country / gl | `constants.ts` → `YOUTUBE_DEFAULT_COUNTRY` |
| Result limits | `constants.ts` → `YOUTUBE_DEFAULT_LIMIT`, `YOUTUBE_MAX_LIMIT` |
| Limit request field | `schemas.ts` → `youtubeLimitSchema(description)` |
| Geo request fields | `schemas.ts` → `YOUTUBE_GEO_REQUEST_SCHEMA` |
| Video / channel / handle ID validation | `schemas.ts` |
| Watch-meta field block | `types.ts` → `YOUTUBE_VIDEO_WATCH_META` |
| Proxy + InnerTube gl resolution | `helpers.ts` → `resolveYoutubeGeo`, `createYoutubeFetchSession` |
| Continuation tokens | `innertube-continuation.ts` |
| Express handler boilerplate | `create-handler.ts` → `createYoutubeHandler` |
| Batch concurrency | `concurrency.ts` → `runWithConcurrency` |

Sub-module schemas **extend** `YOUTUBE_GEO_REQUEST_SCHEMA` — never redefine `country`/`region` locally.

## Response envelope

All handlers return `ALApiResponse<T>` from `backend/src/api/types`:

```ts
{ success: true, data: T } | { success: false, error: string }
```

## Adding a new scraper endpoint

1. Add route path to `YOUTUBE_API_ROUTES` and handler label to `YOUTUBE_HANDLER_LABELS`.
2. Extend or compose schemas from `YOUTUBE_GEO_REQUEST_SCHEMA` / `youtubeLimitSchema`.
3. Put fetch logic in `{resource}/helpers.ts`; keep handlers thin via `createYoutubeHandler`.
4. Reuse `createYoutubeFetchSession`, `postInnertube`, and continuation helpers where applicable.
5. Register route in sub-module `index.ts`.

## When modifying

- Add route path to `YOUTUBE_API_ROUTES` first, then register in sub-module `index.ts`.
- Extend `YOUTUBE_GEO_REQUEST_SCHEMA` for new shared fields — do not duplicate geo fields.
- Use `createYoutubeFetchSession({ country, region })` for all TLS-backed scrapers.
