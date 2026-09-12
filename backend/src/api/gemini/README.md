# Gemini API

Sync HTTP + MCP API that drives the VPS headful Chrome (CDP) against a
logged-in **gemini.google.com** session for one Gemini turn — text, image, or
video, in and out. Runs on the flat Google AI subscription (the `Plus` plan on
the signed-in account), **not** the metered Gemini API.

Returns `text` and/or staged `media` ({ kind, url }) depending on what the turn
produced. Generated images and video are staged under
`{AIXEL_MEDIA_ROOT}/public` → `https://hermes.aixellabs.in/media/…`.

## Own browser instance (no lock shared with chatgpt)

Unlike `chatgpt` (which shares the VPS's original profile on port 9222), this
module spawns its **own** Chrome: a separate profile dir
(`GEMINI_PROFILE_DIR`, default `/home/ubuntu/browser-vnc/chrome-gemini`) on a
separate CDP port (`GEMINI_CDP_HTTP`, default `http://127.0.0.1:9333`), against
the same Xvfb display. So a Gemini call and a ChatGPT call can run at the same
time without contending for one profile/lock. `busy` (module-level) still
serializes Gemini's own calls so two spawns never race for its profile dir.

The Gemini profile is **seeded once** from an existing logged-in Chrome
profile (`GEMINI_SEED_PROFILE_DIR`, defaults to chatgpt's profile): `Default` +
`Local State` are copied, after which the two profiles are independent and the
Gemini login persists in its own dir across spawns. Re-authenticate by running
Chrome headed against `GEMINI_PROFILE_DIR` + the Xvfb display and signing in via
VNC, exactly like `chatgpt`.

**Headed is required** — headless is walled by Cloudflare even with valid
cookies (same as `chatgpt`). **VPS only** — every endpoint refuses unless
`AIXEL_VPS=1`.

## Why DOM-submit, not a forged request

Gemini's own page JS builds every `StreamGenerate` request, including a fresh
~1.5KB per-request anti-abuse token. We type into the composer and click send,
so Google receives a byte-for-byte real click; we only **read** the result back
(assistant text from the DOM, generated image via an in-page `<canvas>`,
generated video via an in-page credentialed `fetch`). We never fabricate the
request or its token — forging it was blocked in testing and is the risky path.

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `GET`  | `/gemini/health` | Chrome binary + profile checks + one real spawn/login check |
| `POST` | `/gemini` | One Gemini turn (sync; a video turn can take minutes) |

Also the `gemini` MCP tool (op `ask`) — same service.

## Request (`POST /gemini`)

```json
{
  "prompt": "Create a short video: a teal robot waves hello in a library.",
  "mode": "new",
  "conversation_id": null,
  "images": null,
  "videos": null,
  "expect": "auto",
  "timeout_seconds": 300
}
```

- `mode: "resume"` requires `conversation_id` (the `/app/<id>` id from a prior
  response) — continues that chat, e.g. to iterate on a generated image or
  extend a video.
- `images` / `videos`: absolute local file paths attached as real input media,
  in order. Omit or `[]` for none. For a remote file, download it first with
  `media` op=fetch (`imageOnly: true` for images) and pass the returned path.
- `expect`: `"auto"` (default — detect text/image, and poll for video if Gemini
  says it's generating one), `"text"`, `"image"`, or `"video"` (force the long
  async Veo poll). Use `"video"` when you know the prompt asks for a video, and
  phrase the prompt as a video brief so Gemini routes it to Veo.
- Uploading video content triggers a one-time "reminder about creating videos"
  consent modal — the module clicks **Agree** automatically.

## Response

```json
{
  "success": true,
  "data": {
    "text": "Your video is ready!",
    "media": [{ "kind": "video", "url": "https://hermes.aixellabs.in/media/….mp4" }],
    "model": "3.6 Flash",
    "conversation_id": "44cb891bb6a90b97",
    "conversation_url": "https://gemini.google.com/app/44cb891bb6a90b97"
  }
}
```

`text` and `media` are each optional per turn — a chat turn returns only `text`;
an image turn returns an `image` media entry (often with a caption `text` too);
a video turn returns a `video` entry. Neither present is a `NO_RESULT` failure
(the model likely refused). Failure: `{ "success": false, "error": "…" }`. A
concurrent call returns `409` busy.

## Proven capabilities (verified live 2026-09-12)

| Turn | Result |
|------|--------|
| text → text | `pong` |
| text → image | 1024×559 PNG (Nano Banana) |
| image in → text | described the uploaded image |
| image + prompt → image | edited image (added element, same style) |
| text → video | 10s 720p H.264+AAC mp4 (Veo), async ~1–5 min |
| video in → text | described the uploaded clip |

Video → video (extend/edit an uploaded clip) uses the same plumbing
(`videos[]` + `expect: "video"`); not yet smoke-tested here.

## Env

| Var | Default |
|-----|---------|
| `GEMINI_CDP_HTTP` | `http://127.0.0.1:9333` |
| `GEMINI_CHROME_BIN` | `/usr/bin/google-chrome-stable` |
| `GEMINI_PROFILE_DIR` | `/home/ubuntu/browser-vnc/chrome-gemini` |
| `GEMINI_SEED_PROFILE_DIR` | `$CHATGPT_PROFILE_DIR` or `/home/ubuntu/browser-vnc/chrome-official` |
| `GEMINI_DISPLAY` | `$CHATGPT_DISPLAY` or `:99` |

## Smoke

```bash
curl -sS http://127.0.0.1:8002/gemini/health | jq .

# Text
curl -sS -X POST http://127.0.0.1:8002/gemini \
  -H 'content-type: application/json' \
  -d '{"prompt":"Reply with exactly: pong","mode":"new","expect":"text"}' | jq .

# Video (async — takes minutes)
curl -sS -X POST http://127.0.0.1:8002/gemini \
  -H 'content-type: application/json' \
  -d '{"prompt":"Create a short video: a teal robot waves hello in a library.","mode":"new","expect":"video","timeout_seconds":600}' | jq .
```

## Known follow-ups

- **Model/mode picker not wired** — the turn uses whatever model the UI
  defaults to (`3.6 Flash` in testing) and lets the prompt route to Veo for
  video. Selecting Fast vs Pro, or forcing the video tool, is not implemented.
- **DRY with chatgpt** — `cdp.ts` (CdpTab + launch/close) mirrors the chatgpt
  module. Kept separate on purpose so each module owns its own browser
  instance; a future shared `browser/` util could dedupe the CDP client.
