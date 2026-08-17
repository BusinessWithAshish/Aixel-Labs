# Transcription (`POST /transcription`)

Turns a video/audio file into a plain transcript — no AI summarization, just
Groq Whisper's raw output in the caption format you ask for.

**No Vercel Blob.** `mediaSource` is either a local filesystem path (read
directly off disk — the expected case when Hermes and this backend share
the VPS's filesystem) or a publicly-reachable URL (downloaded server-side).
There's no client-upload step and nothing to clean up on a third-party
store afterward.

## Request — `POST /transcription`

```jsonc
{
  "mediaSource": "/data/podcasts/episode-42.mp4", // local path or URL
  "format": "srt", // optional, default "txt" — one of txt | json | srt | vtt
  "language": "en", // optional ISO-639-1
  "model": "whisper-large-v3-turbo" // optional, default turbo
}
```

Schema: `schemas.ts` → `TRANSCRIPTION_REQUEST_SCHEMA`.
Limits: `constants.ts` → `TRANSCRIPTION`.

## Response — `ALApiResponse<TRANSCRIPTION_RESPONSE>`

```ts
{
  format: "srt",
  content: "1\n00:00:00,000 --> 00:00:02,480\nHello world.\n",
  language: "en",
  durationSeconds: 12.4,
}
```

## Pipeline

1. `resolveMediaSource` (`download.ts`) resolves `mediaSource` to a local
   path: used in place if it's already a local path (no I/O), downloaded
   otherwise. Tries a plain `fetch()` first for URLs; if that's blocked
   (network error, or a 401/403/429/503 — bot-detection/rate-limit shapes,
   not "genuinely missing") it retries once through the TLS-fingerprint
   session from `utils/node-tls-client-session-handler.ts` (same client
   `gsearch/http.ts` and `website-contacts/crawl.ts` use for scraping) with
   `byteResponse: true`, decoding the returned `data:<mime>;base64,...`
   payload back to bytes.
2. `ffmpeg -y -i <input> -vn -ac 1 -ar 16000 -c:a flac <output>.flac`
   (`ffmpeg.ts`) — extracts audio from video (or just re-encodes audio
   input), downsampled to 16kHz mono. Lossless relative to what Groq does
   internally (it downsamples to 16kHz mono anyway), and shrinks the file
   well below Groq's size cap.
3. `transcribeWithGroq` (`groq-client.ts`) calls Groq's
   `/audio/transcriptions` with `response_format: verbose_json` — the only
   format with segment timestamps, which we need since Groq has no native
   srt/vtt output.
4. `formatters.ts` builds the requested `txt`/`json`/`srt`/`vtt` from the
   verbose_json segments.
5. `cleanupResolvedMediaSource` in a `finally` — only ever deletes the temp
   dir `resolveMediaSource` created itself (`ownsSource`/`workDir` tracked
   explicitly); a caller-supplied local path is never touched.

## Layout

```
transcription/
  index.ts               # route: /
  handler.ts               # thin: zod validate -> client.transcribe -> ALApiResponse
  client.ts                  # orchestration: resolve source -> ffmpeg -> groq -> format -> cleanup
  download.ts                  # resolveMediaSource: local path (used in place) or URL (downloaded), TLS-session fallback if gated
  ffmpeg.ts                      # normalize to 16kHz mono FLAC
  groq-client.ts                   # Groq /audio/transcriptions call
  formatters.ts                      # txt/json/srt/vtt from verbose_json segments
  schemas.ts / types.ts / constants.ts
  README.md
```

## Env

- `GROQ_API_KEY` — required.

## MCP

`transcription_transcribe_media` (`backend/src/mcp/server.ts`) wraps `transcribe()` from
`client.ts` directly — same function the HTTP handler calls, no loopback —
and reuses `TRANSCRIPTION_REQUEST_SCHEMA` unchanged. It takes `mediaSource`
as a local path or URL, not raw bytes: MCP tool calls carry JSON args only.

## Notes / tunables

- Size/format caps are named constants in `constants.ts` — tune freely.
