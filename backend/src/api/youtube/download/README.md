# YouTube Download API

Writes a YouTube video (or audio) to local disk via the in-house InnerTube
client and returns the **file path**. Not mounted as an MCP op. Vercel
returns 501 — this needs a persistent host with disk.

## Endpoint

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/video/download` | `API_ENDPOINTS.YOUTUBE.VIDEO_DOWNLOAD` |

## Request body

`schemas.ts` → `YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA` (extends geo schema):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | Routes the Evomi residential proxy (IP-egress country) |
| `region` | `string` | — | Unused for download |
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

## How it works (in-house InnerTube, no external binary)

`helpers.ts` uses [`youtubei.js`](https://github.com/LuanRT/YouTube.js) to
call YouTube's InnerTube API directly — no `yt-dlp` shell-out, no browser
cookies, no Proof-of-Origin token provider. The previous `yt-dlp` path hit
YouTube's "Sign in to confirm you're not a bot" wall on datacenter IPs
whenever the WEB client demanded a PoToken we cannot mint server-side.

The InnerTube client chain tried in order is `IOS → ANDROID_VR → VISIONOS`.
All three are JS-less / PoToken-exempt today, so they keep working where the
WEB client is blocked. If every client fails (private, age-restricted, or
removed video), the request fails with `NO_CLIENTS` — there is no further
fallback.

- **Audio** — one adaptive audio stream → `.m4a`.
- **Video** — separate video + audio adaptive streams → `ffmpeg-static`
  merge → `.mp4`. IOS/VISIONOS only return adaptive (not progressive)
  formats for most videos, so the video path always merges even when a
  progressive stream exists — keeps the code path single.

The Innertube session is created once per country and cached
(`enable_session_cache`). If the file already exists on disk, the client is
not spawned (cache hit).

### IP-egress: Evomi residential proxy

YouTube blocks datacenter IP ranges (the VPS included) at the network
layer with `LOGIN_REQUIRED` / "Sign in to confirm you're not a bot",
**before** any client/token logic is evaluated — the same InnerTube
clients that work from a residential IP fail from a datacenter IP. Client
rotation and PoTokens don't fix a network-layer IP block.

When Evomi is configured (`PROXY_CONFIG` in `utils/constants.ts`),
`helpers.ts` routes youtubei.js's `fetch` through an undici `ProxyAgent`
bound to a residential exit in the request's `country`. One `ProxyAgent`
per country with a stable session suffix, so the InnerTube API call and
the googlevideo stream fetch egress from the same IP (the stream URLs are
signed to the requesting IP — a mismatch makes YouTube reject the
download). When Evomi is **not** configured (local dev without creds),
`Innertube.create` gets no custom `fetch` and youtubei.js fetches
directly — fine from a residential dev machine.

## Disk

Default dir: `{AIXEL_MEDIA_ROOT}/private/youtube-downloads/{id}.mp4` (`.m4a`
for audio). Unset `AIXEL_MEDIA_ROOT` → `cwd/storage/private/youtube-downloads`.
Override with `YOUTUBE_DOWNLOAD_DIR`.

ffmpeg for the video merge comes from `ffmpeg-static` (no system ffmpeg
required, but it's used if present).

## Smoke

```bash
# Audio (the case that previously hit the sign-in wall)
curl -sS -X POST http://localhost:8002/youtube/video/download \
  -H 'content-type: application/json' \
  -d '{"videoId":"jNQXAC9IVRw","media":"audio"}'

# Video
curl -sS -X POST http://localhost:8002/youtube/video/download \
  -H 'content-type: application/json' \
  -d '{"videoId":"jNQXAC9IVRw"}'
```
