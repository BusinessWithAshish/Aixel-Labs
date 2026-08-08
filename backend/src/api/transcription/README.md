# Transcription (`POST /transcription`)

Turns a video/audio file into a plain transcript — no AI summarization, just
Groq Whisper's raw output in the caption format you ask for.

Runs as a Vercel Serverless Function, which hard-caps request bodies at
4.5MB, so uploads never go through this endpoint directly. Instead:

1. Client asks `POST /transcription/blob-upload` for a Vercel Blob client
   upload token (content-type/size enforced by Blob itself, from
   `constants.ts` → `TRANSCRIPTION_ALLOWED_CONTENT_TYPES` /
   `TRANSCRIPTION.MAX_UPLOAD_SIZE_BYTES`).
2. Client uploads the raw file **directly to Blob storage** with that token
   (via `@vercel/blob/client`'s `upload()` helper) — never touches this
   function. **This project's Blob store is private-only** — the client's
   `upload()` call must pass `access: 'private'` (`access: 'public'` is
   rejected by the store). `download.ts` sends `BLOB_READ_WRITE_TOKEN` as a
   bearer token when fetching the blob server-side to match.
3. Client calls `POST /transcription` with the resulting blob URL.

## Request — `POST /transcription`

```jsonc
{
  "blobUrl": "https://<store>.public.blob.vercel-storage.com/....mp4",
  "format": "srt", // optional, default "txt" — one of txt | json | srt | vtt
  "language": "en", // optional ISO-639-1
  "model": "whisper-large-v3-turbo" // optional, default turbo
}
```

Schema: `schemas.ts` → `TRANSCRIPTION_REQUEST_SCHEMA`.
Limits/allow-lists: `constants.ts` → `TRANSCRIPTION`, `TRANSCRIPTION_ALLOWED_CONTENT_TYPES`.

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

1. Download the source to a temp file (`download.ts`). Tries a plain
   `fetch()` first; if that's blocked (network error, or a 401/403/429/503 —
   bot-detection/rate-limit shapes, not "genuinely missing") it retries once
   through the TLS-fingerprint session from
   `utils/node-tls-client-session-handler.ts` (same client `gsearch/http.ts`
   and `website-contacts/crawl.ts` use for scraping) with `byteResponse: true`,
   decoding the returned `data:<mime>;base64,...` payload back to bytes. This
   matters once a source is anything other than our own Blob URL — e.g. a
   third-party CDN link passed to `transcribe_media` over MCP.
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
5. Temp files and the Blob object are deleted in a `finally` — nothing is
   retained after transcribing.

## Layout

```
transcription/
  index.ts               # routes: /blob-upload, /
  blob-upload-handler.ts # issues Vercel Blob client-upload tokens
  handler.ts              # thin: zod validate -> client.transcribe -> ALApiResponse
  client.ts                # orchestration: download -> ffmpeg -> groq -> format -> cleanup
  download.ts               # fetch -> temp file, TLS-session fallback if gated
  ffmpeg.ts                  # normalize to 16kHz mono FLAC
  groq-client.ts              # Groq /audio/transcriptions call
  formatters.ts                 # txt/json/srt/vtt from verbose_json segments
  schemas.ts / types.ts / constants.ts
  README.md
```

## Env

- `GROQ_API_KEY` — required.
- `BLOB_READ_WRITE_TOKEN` — Vercel auto-injects this in production once a
  Blob store is linked to the project; pull it manually for local dev
  (`vercel env pull` or copy from the dashboard's Storage → Blob tab).

## MCP

`transcribe_media` (`backend/src/mcp/server.ts`) wraps `transcribe()` from
`client.ts` directly — same function the HTTP handler calls, no loopback —
and reuses `TRANSCRIPTION_REQUEST_SCHEMA` unchanged. It takes a URL, not raw
bytes: MCP tool calls carry JSON args only, so there's no MCP equivalent of
the blob-upload step (that step exists purely so a *browser* can PUT bytes
directly to Blob storage). Callers must already have a URL — the same
`blobUrl` from the web upload flow, or any other publicly-reachable link.

## Notes / tunables

- Size/format caps are named constants in `constants.ts` — tune freely.
