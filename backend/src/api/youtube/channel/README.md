# YouTube Channel API

Scrapes a YouTube channel page via InnerTube `browse` and returns channel metadata plus tab content (videos, shorts, or playlists).

## Endpoint

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/channel` | `API_ENDPOINTS.YOUTUBE.CHANNEL` |

## Request body

Validated by `schemas.ts` → `YOUTUBE_CHANNEL_REQUEST_SCHEMA` (extends `YOUTUBE_GEO_REQUEST_SCHEMA`).

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | 2-letter ISO — proxy + InnerTube `gl` |
| `region` | `string` | — | Optional proxy region |
| `channelId` | `string` | — | Required unless `handle` is set |
| `handle` | `string` | — | Required unless `channelId` is set |
| `contentType` | `"videos" \| "shorts" \| "playlists"` | `"videos"` | Channel tab |
| `limit` | `number` | `1000` | Max items (1–1000) |

## Response

`ALApiResponse<YOUTUBE_CHANNEL_RESPONSE>` — see `types.ts`.

## How it works

1. `createYoutubeFetchSession({ country, region })`.
2. GET `/channel/{channelId}` for `INNERTUBE_CLIENT_VERSION`.
3. POST `/youtubei/v1/browse` with `gl` = `country` and tab-specific `params`.
4. Paginate via continuation tokens until `limit`.

## Shared dependencies

- `../schemas` — geo, channel ID, handle value schemas
- `../constants` — limits, InnerTube URLs, `YOUTUBE_DEFAULT_COUNTRY`
- `../helpers` — session, geo, parsers

## Notes for agents

- `channelInfo.country` in the response is the channel's listed country from YouTube About — not the request `country` param.
- `posts` tab is not supported; it is commented out in `constants.ts` (`YT_CHANNEL_CONTENT_TYPE`).
