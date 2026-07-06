# YouTube API module

Express router mounting scraper sub-APIs under `/youtube`. All endpoints use **POST** and share geo fields. All scrape YouTube without the official Data API.

## Route registration

`index.ts` registers, in order:

| Sub-API | README | Method | Route |
|---------|--------|--------|-------|
| Search | [search/README.md](./search/README.md) | `POST` | `/search` |
| Video | [video/README.md](./video/README.md) | `POST` | `/video`, `/video/suggested` |
| Handle | — | `POST` | `/handle` |
| Channel | [channel/README.md](./channel/README.md) | `POST` | `/channel` |
| Intelligence | [intelligence/README.md](./intelligence/README.md) | `POST` | `/intelligence/search`, `/intelligence/video`, `/intelligence/channel`, `/intelligence/handle` |

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
├── index.ts          # Router aggregator
├── constants.ts      # Base URL, routes, limits, InnerTube config
├── schemas.ts        # Shared geo + ID schemas (single source of truth)
├── types.ts          # Shared renderer shapes + YOUTUBE_GEO_REQUEST
├── helpers.ts        # Shared parsers, geo session, InnerTube utilities
├── search/
├── video/
├── handle/
├── channel/
└── intelligence/     # Derived endpoints (raw + computed intelligence block)
```

## Single source of truth

| Concern | Canonical location |
|---------|-------------------|
| Routes | `constants.ts` → `YOUTUBE_API_ROUTES` |
| Default country / gl | `constants.ts` → `YOUTUBE_DEFAULT_COUNTRY` |
| Result limits | `constants.ts` → `YOUTUBE_DEFAULT_LIMIT`, `YOUTUBE_MAX_LIMIT` |
| Geo request fields | `schemas.ts` → `YOUTUBE_GEO_REQUEST_SCHEMA` |
| Video / channel / handle ID validation | `schemas.ts` |
| Proxy + InnerTube gl resolution | `helpers.ts` → `resolveYoutubeGeo`, `createYoutubeFetchSession` |
| Evomi proxy password suffixes | `utils/fetch-session-common.ts` → `buildEvomiProxyUrl` |

Sub-module schemas **extend** `YOUTUBE_GEO_REQUEST_SCHEMA` — never redefine `country`/`region` locally.

## Response envelope

All handlers return `ALApiResponse<T>` from `backend/src/api/types`:

```ts
{ success: true, data: T } | { success: false, error: string }
```

## When modifying

- Add route path to `YOUTUBE_API_ROUTES` first, then register in sub-module `index.ts`.
- Extend `YOUTUBE_GEO_REQUEST_SCHEMA` for new shared fields — do not duplicate geo fields.
- Use `createYoutubeFetchSession({ country, region })` for all TLS-backed scrapers.
