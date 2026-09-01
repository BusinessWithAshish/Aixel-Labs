# YouTube Download API

Writes a YouTube video (or audio) to local disk via the system `yt-dlp` binary and returns the **file path**. Not mounted as an MCP op. Vercel returns 501 — this needs a persistent host with yt-dlp, ffmpeg, and disk.

## Endpoint

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/video/download` | `API_ENDPOINTS.YOUTUBE.VIDEO_DOWNLOAD` |

## Request body

`schemas.ts` → `YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA` (extends geo schema):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | Unused for yt-dlp; kept for shared geo shape |
| `region` | `string` | — | Unused for yt-dlp |
| `videoId` | `string` | required | Video ID **or** watch / shorts / youtu.be URL |
| `media` | `"video" \| "audio"` | `"video"` | `video` → merged mp4; `audio` → m4a |

Playlist-only URLs (no `v=`) return 400. One video per call.

## Response

`ALApiResponse<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE>`:

```ts
{
  videoId: string;
  title: string;
  durationSeconds: number;
  filePath: string;   // host-local path, not bytes, not a googlevideo URL
  mimeType: string;
  bytes: number;
  media: "video" | "audio";
}
```

## Disk

Default dir: `{AIXEL_MEDIA_ROOT}/private/youtube-downloads/{id}.mp4` (`.m4a` for audio). Unset `AIXEL_MEDIA_ROOT` → `cwd/storage/private/youtube-downloads`. Override with `YOUTUBE_DOWNLOAD_DIR`. Binary override: `YOUTUBE_YT_DLP_BIN` (default `yt-dlp`). If the file already exists, yt-dlp is not spawned. Not public — copy into `public/` only when a URL is required.

ffmpeg for merge/extract comes from `ffmpeg-static` (`--ffmpeg-location`).

## Smoke

```bash
curl -sS -X POST http://localhost:8002/youtube/video/download \
  -H 'content-type: application/json' \
  -d '{"videoId":"jNQXAC9IVRw"}'
```
