# YouTube Search API

Scrapes YouTube search results for a query, with optional content-type filter and pagination up to 1000 items.

## Endpoint


| Method | Route             | Config key                     |
| ------ | ----------------- | ------------------------------ |
| `POST` | `/youtube/search` | `API_ENDPOINTS.YOUTUBE.SEARCH` |


## Request body

Validated by `schemas.ts` → `YOUTUBE_SEARCH_REQUEST_SCHEMA` (extends shared `YOUTUBE_GEO_REQUEST_SCHEMA`).


| Field          | Type               | Default   | Notes                                               |
| -------------- | ------------------ | --------- | --------------------------------------------------- |
| `country`      | `string`           | `"US"`    | 2-letter ISO code — proxy routing + InnerTube `gl`  |
| `region`       | `string`           | —         | Optional proxy region (not sent to YouTube)         |
| `query`        | `string`           | required  | 1–500 chars                                         |
| `filter`       | `YT_SEARCH_FILTER` | `"video"` | `video` or `channel` only                           |
| `limit`        | `number`           | `1000`    | Max results (1–1000)                                |
| `withPlaylist` | `boolean`          | `false`   | **Declared in schema but not used in `helpers.ts`** |


Filter `sp` query values live in `../constants.ts` → `YOUTUBE_SEARCH_FILTER_SP`.

## Response

`ALApiResponse<YOUTUBE_SEARCH_RESPONSE>` — see `types.ts`.

```ts
{
  resultType: YT_SEARCH_FILTER;
  items: YOUTUBE_SEARCH_VIDEO_ITEM[] | YOUTUBE_SEARCH_CHANNEL_ITEM[];
  searchQuery: string;
  estimatedResults: number | null;
  totalResults: number | null;
}
```

## How it works

1. `createYoutubeFetchSession({ country, region })` — country-targeted Evomi proxy when configured.
2. Build URL: `/results?search_query={query}&sp={filter}`.
3. Extract `ytInitialData` and `INNERTUBE_CLIENT_VERSION` from HTML.
4. Walk search renderer tree; paginate via POST `/youtubei/v1/search` with `gl` = `country`.
5. Slice to `limit` and return.

## Shared dependencies

- `../schemas` — `YOUTUBE_GEO_REQUEST_SCHEMA`
- `../constants` — routes, filters, limits, InnerTube URLs
- `../helpers` — `createYoutubeFetchSession`, `resolveYoutubeGeo`, parsers

## Notes for agents

- `gl` was removed as a separate field — use `country` (defaults to `US`).
- Only `video` and `channel` search filters are supported; `playlist`, `movie`, and `short` are commented out in `../constants.ts` until parsers exist.
- `constants.ts` filter enums (`YoutubeFilters`) are not wired into the request schema yet.

