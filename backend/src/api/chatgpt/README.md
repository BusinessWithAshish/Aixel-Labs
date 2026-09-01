# ChatGPT API

Sync HTTP + MCP API that drives the VPS headful Chrome (CDP / VNC ChatGPT
login) for any ChatGPT turn — plain chat, image generation, or both. Returns
`text` and/or `media_url` depending on what ChatGPT actually produced; caller
does not declare which one it wants ahead of time. When an image comes back
it's staged as a public JPEG under `{AIXEL_MEDIA_ROOT}/public` →
`https://hermes.aixellabs.in/media/…`.

Requires the same host as `aixel-chromium` (localhost CDP). **VPS only** —
every endpoint (including `/health`) refuses to run unless `AIXEL_VPS=1` is
set, so a local `pnpm dev` or a Vercel deployment can't accidentally drive a
browser session that isn't there.

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `GET` | `/chatgpt/health` | Preflight (systemd + CDP + session) |
| `POST` | `/chatgpt` | One ChatGPT turn (sync; may take many minutes for an image) |
| `POST` | `/chatgpt/stage` | Download a URL to a local reference file (fast, no browser) |

Also exposed as the `chatgpt` MCP tool (ops `generate` and `stage_image`) — same request/response shapes, same underlying services.

## Staging a reference image (`POST /chatgpt/stage`)

For research flows that find a viral post and want to use its image as a
generation reference: download it first, then pass the path into `images[]`.

```json
{ "url": "https://…instagram-cdn…/post-image.jpg" }
```

```json
{ "success": true, "data": { "path": "/home/ubuntu/media/refs/….jpg", "content_type": "image/jpeg", "size_bytes": 123456 } }
```

Staged files live under `CHATGPT_STAGE_ROOT` (default `/home/ubuntu/media/refs`,
private — not web-served, unlike generated output under `MEDIA_ROOT`). Max
15MB, must be a real image content-type. Nothing cleans these up automatically
— they're meant to accumulate as a reference library, not ephemeral scratch.

## Request (`POST /chatgpt`)

```json
{
  "project_url": "https://chatgpt.com/g/g-p-…/project",
  "prompt": "…",
  "mode": "new",
  "conversation_url": null,
  "revise_notes": null,
  "images": null
}
```

- `mode: "revise"` requires `conversation_url` from a prior success — continues that conversation instead of opening `project_url` fresh.
- `images`: absolute local file paths attached to the message as real input images, in order (e.g. the brand logo, reference posts to emulate). Omit for the server default (just the brand logo, `CHATGPT_LOGO_PATH`); pass `[]` to attach nothing.
- Concurrent calls → `409` busy — this drives one shared browser session.

## Response

```json
{
  "success": true,
  "data": {
    "text": "…assistant text, if any…",
    "media_url": "https://hermes.aixellabs.in/media/….jpg",
    "conversation_url": "https://chatgpt.com/c/…"
  }
}
```

`text` and `media_url` are each optional — a plain chat turn returns only
`text`; an image turn returns `media_url` (and often `text` too, e.g. a short
caption). Failure: `{ "success": false, "error": "…" }`. Neither `text` nor
`media_url` present is itself a failure (`NO_RESULT`) — the model likely
refused or the turn produced nothing usable.

## Smoke

```bash
curl -sS http://127.0.0.1:8002/chatgpt/health | jq .

# Plain chat turn, no image
curl -sS -X POST http://127.0.0.1:8002/chatgpt \
  -H 'content-type: application/json' \
  -d '{
    "project_url":"'"$CHATGPT_PROJECT_URL"'",
    "prompt":"In one sentence, what makes a SaaS landing page convert?",
    "mode":"new",
    "images":[]
  }' | jq .

# Image turn with multiple reference images (logo + a viral post to emulate)
curl -sS -X POST http://127.0.0.1:8002/chatgpt \
  -H 'content-type: application/json' \
  -d '{
    "project_url":"'"$CHATGPT_PROJECT_URL"'",
    "prompt":"Square flat-vector product still: one inbox UI. Use the first attached image as the exact logo source, pixel-faithful. Use the second attached image only as a layout/composition reference, not for its content.",
    "mode":"new",
    "images":["/home/ubuntu/AIXEL-LABS-ORG/brand/assets/aixellabs-lockup.png","/home/ubuntu/media/refs/example-viral-post.jpg"]
  }' | jq .
```
