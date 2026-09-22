# YouTube Download API

Writes a YouTube video (or audio) to local disk and returns the **file
path**. The bytes come from a third-party downloader website driven in a
headed Chrome on the VPS — **not** through the Evomi residential proxy. Also
the `youtube` MCP op `video_download`. Vercel returns 501 (no persistent
disk); a host without an X display returns 501 (no headed browser).

## Endpoint

| Method | Route | Config key |
|--------|-------|------------|
| `POST` | `/youtube/video/download` | `API_ENDPOINTS.YOUTUBE.VIDEO_DOWNLOAD` |

## Request body

`schemas.ts` → `YOUTUBE_VIDEO_DOWNLOAD_REQUEST_SCHEMA` (extends geo schema):

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `country` | `string` | `"US"` | Accepted for compatibility; unused (no proxy) |
| `region` | `string` | — | Unused |
| `videoId` | `string` | required | Video ID **or** watch / shorts / youtu.be URL |
| `media` | `"video" \| "audio"` | `"video"` | `video` → mp4 (up to 1080p); `audio` → m4a |

Playlist-only URLs (no `v=`) return 400. One video per call.

## Response

`ALApiResponse<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE>`:

```ts
{
  videoId: string;
  title: string;            // from YouTube oEmbed; the videoId on a cache hit
  durationSeconds: number;  // read by ffmpeg; 0 on a cache hit
  filePath: string;         // host-local path, not bytes
  mimeType: string;
  bytes: number;
  media: "video" | "audio";
}
```

Errors: `404` when YouTube's oEmbed says the video does not exist (checked
before any browser starts); `502` "Every downloader site failed" with each
site's reason when no site delivers.

## How it works (`site.ts`)

**Why a downloader site.** YouTube walls the VPS's datacenter IP, so the
previous InnerTube path pulled every byte through the metered Evomi proxy —
one long podcast cost >1.3 GB of it. A downloader site fetches from YouTube
on its own servers; the VPS only receives the finished file from the site,
on its own IP.

**Why a real browser.** The sites guard their conversion calls with in-page
tokens (loader.to attaches a proof-of-work token). Filling the form and
letting the page's own JS run avoids reverse-engineering them. The browser is
headed on the Xvfb display (`:99`) like the chatgpt and gemini modules, so a
run can be watched in noVNC.

Per call:

1. `youtube.com/oembed` (direct, no proxy) — title, and a fast 404 for a
   video that does not exist.
2. A throwaway Chrome: temp profile, `--remote-debugging-port=0`, port read
   from `DevToolsActivePort`. Concurrent calls never share a profile lock;
   ad cookies never accumulate. Ad popups that get past Chrome's popup
   blocker are closed as they open.
3. Sites in order until one delivers. Each: wait until the form can be
   submitted → fill URL + format and submit (from JS, not a user gesture) →
   poll until the finished file's URL is on the page.
4. Navigate to that URL; `Browser.setDownloadBehavior` makes Chrome write it
   into the download dir as `<guid>` (`<guid>.crdownload` while in flight).
   The site's own **Download button is never clicked** — both sites wire it
   to an ad pop-under.
5. ffmpeg stream-copies it to `{videoId}.mp4` / `.m4a`: exactly one video +
   one audio stream (audio only for m4a), no chapters, `+faststart`. This
   strips noTube's subtitle tracks and PNG cover, and doubles as validation —
   a site that served an error page instead of media fails here and the next
   site is tried.

| Site | Video format | Notes (measured 2026-09-21) |
|------|--------------|-------|
| `en.loader.to` | `1080` | 19-min 1080p60 ready in ~12 s. Never reports a video it cannot fetch — sits at "100%" with no link — so a progress stall (5 min unchanged) ends it. Failure otherwise blanks the link and writes the reason into the button. |
| `notube.lol` | `mp4hd` | Same video ~100 s. Submit button ships `disabled` until a probe to its conversion servers answers; clicking earlier does nothing. Refusals are redirects to `/plus?feature=duration\|limitation\|unlimited` (free-tier length cap, quotas) or `/downloads?…&error=N`. |

Dropped after trying from the VPS's Frankfurt IP: y2mate and ytmp3
("Restricted" for German IPs), cobalt.tools (YouTube disabled on the public
instance), savefrom.net (googlevideo URLs signed to its own IP → 403 from
ours), ssvid.net (HD routed to its desktop app).

**When a site breaks**, its selectors are the whole of its entry in `SITES`
(`site.ts`). Open the site in a Chrome on `:99` (noVNC), redo the steps by
hand, and read the page's own JS for how it reports progress and failure.

Timeouts live in `YOUTUBE_SITE_DOWNLOAD` (`constants.ts`).

## Disk

Fixed dir: `{AIXEL_MEDIA_ROOT}/private/youtube-downloads/{id}.mp4` (`.m4a`
for audio). Unset `AIXEL_MEDIA_ROOT` → `cwd/storage/private/youtube-downloads`.
If the file already exists, no browser starts (cache hit). The file is
written as `.part` and renamed, so a killed run never leaves a truncated file
that a later call would treat as cached.

ffmpeg comes from `ffmpeg-static`; Chrome from
`/usr/bin/google-chrome-stable`.

## Not this module: stream-direct cuts

`getYoutubeStreamUrls` (same `helpers.ts`) still signs googlevideo URLs via
InnerTube through Evomi, for `media` op=cut: only the KB-sized player call
and the clip ranges ffmpeg reads cross the proxy.

## Smoke

```bash
curl -sS -X POST http://localhost:8002/youtube/video/download \
  -H 'content-type: application/json' \
  -d '{"videoId":"jNQXAC9IVRw","media":"audio"}'

curl -sS -m 900 -X POST http://localhost:8002/youtube/video/download \
  -H 'content-type: application/json' \
  -d '{"videoId":"jNQXAC9IVRw"}'
```
