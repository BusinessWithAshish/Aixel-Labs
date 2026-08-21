# YouTube Comments API

Fetches a video's comments via InnerTube `POST /youtubei/v1/next` (the same
WEB-client endpoint youtube.com uses in the network tab). No official Data API
key and no yt-dlp — unlike `/viral-clipper/youtube-comments`.

Verified live 2026-08-20 against [Despacito](https://www.youtube.com/watch?v=kJQP7kiw5Fk)
(`commentThreadRenderer` + `frameworkUpdates.commentEntityPayload`; replies
also use `/youtubei/v1/next`).

## Endpoint

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/video/comments` | `API_ENDPOINTS.YOUTUBE.VIDEO_COMMENTS` |

## Request body

`schemas.ts` → `YOUTUBE_VIDEO_COMMENTS_REQUEST_SCHEMA` (extends `YOUTUBE_GEO_REQUEST_SCHEMA`):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | 2-letter ISO — proxy + InnerTube `gl` |
| `region` | `string` | — | Optional region hint |
| `videoId` | `string` | required | Alphanumeric, max 20 |
| `sort` | `"top" \| "newest"` | `"top"` | YouTube's own sort continuations |
| `limit` | `number` | `20` | Max comments, 1–200 |
| `continuation` | `string` | — | Page more comments, or a comment's `repliesContinuation` for replies |

## Response

`ALApiResponse<YOUTUBE_VIDEO_COMMENTS_RESPONSE>`:

```ts
{
  videoId: string;
  sort: "top" | "newest";
  commentsDisabled: boolean;
  commentCount: number | null;       // e.g. 4300000 from "4.3M"
  commentCountText: string | null;
  comments: YOUTUBE_COMMENT[];
  continuation: string | null;       // next page of this list
}
```

Each comment includes `repliesContinuation` when YouTube exposed a replies
token — pass it back as `continuation` to fetch that thread.

## How it works

1. `createYoutubeFetchSession({ country, region })`.
2. Cached WEB `INNERTUBE_CLIENT_VERSION` + `POST /youtubei/v1/get_watch` to
   resolve the video and pull the comments continuation (Top / Newest tokens
   live on `engagement-panel-comments-section`). Falls back to watch-page
   `ytInitialData` only when get_watch omits the token.
3. `POST /youtubei/v1/next` with `{ context, continuation }` until `limit`.
4. Join `commentThreadRenderer` / `commentViewModel` rows to
   `frameworkUpdates.entityBatchUpdate.mutations[].commentEntityPayload`.

## Architecture

```
comments/
├── README.md
├── index.ts       # Route registration + public exports
├── handler.ts     # createYoutubeHandler
├── schemas.ts     # request Zod
├── types.ts       # public response + InnerTube raw shapes
├── constants.ts   # limits, sort enum, field descriptions
├── compute.ts     # bootstrap + next-response parse (no I/O)
├── fetch.ts       # InnerTube next + watch-page fallback
└── helpers.ts     # fetchYoutubeVideoComments orchestration
```

## Shared dependencies

- `../schemas` — geo + `YOUTUBE_VIDEO_ID_SCHEMA`
- `../constants` — InnerTube next URL, comments panel target id, disabled marker
- `../helpers` — session, geo, `postInnertube`
- `../video/get-watch` — resolvability + get_watch bootstrap
- `../create-handler` — Express handler factory

## Smoke

```bash
curl -sS -X POST http://localhost:8002/youtube/video/comments \
  -H 'content-type: application/json' \
  -d '{"videoId":"kJQP7kiw5Fk","limit":5}'
```

## Notes for agents

- Do not use `/youtubei/v1/comment/get_comment_replies` — the live WEB client
  loads replies through `/youtubei/v1/next` with the thread continuation.
- Timestamp-highlight clustering for viral clips stays on
  `/viral-clipper/youtube-comments` (yt-dlp). This API returns the
  comments themselves. MCP: `youtube` `op=comments` (`layer=raw` or `intel`).
