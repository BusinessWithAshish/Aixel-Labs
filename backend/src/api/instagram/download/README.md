# Instagram download

Saves public Instagram **post / reel / tv / carousel** media to local disk and
returns file paths. No login, no browser.

| Surface | Name |
|---------|------|
| HTTP | `POST /instagram/download` (`API_ENDPOINTS.INSTAGRAM.DOWNLOAD`) |
| MCP | `instagram` op=`download` (raw only) |

Refused on Vercel (`assertPersistentDisk`) — it writes to disk.

## Request

`schemas.ts` → `IG_DOWNLOAD_REQUEST_SCHEMA`

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `urls` | `string[]` 1–10 | required | `/p/`, `/reel/`, `/reels/`, `/tv/` URLs, owner-prefixed URLs, or bare shortcodes |
| `items` | `number[]` | all slides | Carousel only, 0-based slide indexes |
| `media` | `"all" \| "video" \| "image"` | `"all"` | `image` skips videos (a reel's cover is not saved) |
| `maxBytes` | `number` | 200 MB | Per file; aborted mid-stream and deleted when crossed |

## Response

```ts
{
  posts: [{
    input, shortcode, ok, error?,
    url?, mediaTypeLabel?, productType?, owner?, caption?, takenAt?,
    items: [{ index, kind: "video" | "image", filePath, bytes, width, height, cached }]
  }],
  bytesFetched   // crawler pages + media pulled this call (GraphQL metadata and cache hits not counted)
}
```

A bad URL or a failed post is reported in its own entry (`ok: false`) — the
rest of the batch still runs. Posts run sequentially.

Files land at `{AIXEL_MEDIA_ROOT}/private/instagram-downloads/{shortcode}/{index}.{mp4|jpg}`
(`AIXEL_MEDIA.INSTAGRAM_DOWNLOADS`). An existing file is returned as `cached: true`
without re-downloading; the post metadata is still looked up.
No retention policy on this folder yet.

## How it works

1. `client.ts` → `extractShortcode` (reuses `advanced/search/compute/classify-url.ts`, plus `/tv/`).
2. The logged-out GraphQL post query (`fetchLoggedOutMedia`, media id decoded
   from the shortcode) — direct first, through Evomi only if direct is refused
   and Evomi is configured (`graphql.ts`). Since 2026-10 this leads: the crawler
   page below is a login wall for most posts from the VPS.
3. Fallback: `GET https://www.instagram.com/p/{shortcode}/` with a **Googlebot
   UA**, direct `fetch`; `compute/parse-ssr.ts` → `findFeedItemInSsr` reads the
   feed item from its `<script type="application/json">` blobs.
4. `advanced/compute/map-post.ts` → `mapFeedItem` — same mapper as the
   `posts` op. One asset per slide: its largest video, else its largest image.
5. Each CDN file (`*.cdninstagram.com`) is streamed direct to a `.part` file,
   then renamed. Reels are progressive mp4 with audio — no ffmpeg merge.

### Why direct, why Googlebot (probed 2026-09-10 from the VPS)

| Method | Result |
|--------|--------|
| Post page, Googlebot UA | ✅ full media JSON |
| Post page, Chrome / iPhone / facebookexternalhit UA | page loads, no media JSON |
| `/p/{code}/embed/captioned/` | login wall |
| `i.instagram.com/api/v1/media/{pk}/info/`, `/p/{code}/?__a=1` | 404 |
| `graphql/query` shortcode doc_id | 403 |

The media files and the crawler page are always fetched direct — a page plus a
reel is ~10 MB, too much for metered bandwidth. Only the small GraphQL metadata
query may go through Evomi. If neither route returns the feed item, the post
fails with `NOT_FOUND`.

## Smoke

```bash
curl -s localhost:8002/instagram/download -H 'content-type: application/json' \
  -d '{"urls":["https://www.instagram.com/reel/DdCiSuOgRk3/"]}' | jq
```
