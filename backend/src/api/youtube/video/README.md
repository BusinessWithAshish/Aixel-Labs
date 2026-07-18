# YouTube Video API

Fetches video metadata and suggested (related) videos via InnerTube `get_watch` and `next` endpoints.

## Endpoints

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/video` | `API_ENDPOINTS.YOUTUBE.VIDEO` |
| `POST` | `/youtube/video/suggested` | `API_ENDPOINTS.YOUTUBE.VIDEO_SUGGESTED` |

## Video details — `POST /video`

### Request body

`schemas.ts` → `YOUTUBE_VIDEO_REQUEST_SCHEMA` (extends `YOUTUBE_GEO_REQUEST_SCHEMA`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | 2-letter ISO — proxy + InnerTube `gl` |
| `region` | `string` | — | Optional proxy region |
| `videoId` | `string` | required | Alphanumeric, max 20 |

### Response

`ALApiResponse<YOUTUBE_VIDEO_DETAILS_RESPONSE>`:

```ts
{
  id: string;
  title: string | null;
  thumbnail: YT_THUMBNAIL[] | null;
  isLive: boolean;
  channel: string | null;
  channelId: string | null;
  description: string | null;
  viewCount: number | null;
  viewCountText: string | null;
  lengthSeconds: number | null;
  keywords: string[];
}
```

## Suggested videos — `POST /video/suggested`

### Request body

`YOUTUBE_VIDEO_SUGGESTED_REQUEST_SCHEMA` — same as video details plus:

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | `number` | `1000` | Max suggestions (1–1000) |

### Response

`ALApiResponse<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE>`:

```ts
{
  videoId: string;
  items: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  totalResults: number;
}
```

## How it works

1. `createYoutubeFetchSession({ country, region })`.
2. GET `/watch?v={videoId}` for `INNERTUBE_CLIENT_VERSION` (+ `ytInitialData` for comment counts).
3. POST `/youtubei/v1/get_watch` with `gl` = `country`.
4. Resolvability: only `playabilityStatus: ERROR` (or missing `videoDetails`) is treated as not found. `UNPLAYABLE` / `LOGIN_REQUIRED` still yield metadata when `videoDetails` is present.
5. Suggested: parse watch-next lockups; paginate via `/youtubei/v1/next`.

## Shared dependencies

- `../schemas` — geo + `YOUTUBE_VIDEO_ID_SCHEMA`
- `../constants` — limits, InnerTube URLs
- `../helpers` — session, geo, parsers
- `../types` — `YT_THUMBNAIL`, lockup shapes

## Notes for agents

- `likeCount` comes from get_watch microformat; `commentCount` often requires watch-page `ytInitialData` engagement-panel contextualInfo when get_watch is UNPLAYABLE and omits the comments panel.
