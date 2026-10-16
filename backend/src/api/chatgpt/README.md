# ChatGPT API

Sync HTTP + MCP API that drives the VPS headful Chrome (CDP / VNC ChatGPT
login) for any ChatGPT turn — plain chat, image generation, or both. Returns
`text` and/or `media_url` depending on what ChatGPT actually produced; caller
does not declare which one it wants ahead of time. When an image comes back
it's staged as a public JPEG under `{AIXEL_MEDIA_ROOT}/public` →
`https://hermes.aixellabs.in/media/…`.

Spawns a fresh headed Chrome per call against a persistent profile dir
(the `account`'s `profile_dir`, see [Accounts](#accounts)) and closes it
when done.
Login state lives in the profile directory, not a running process, so it
survives every spawn. **Headed is required, not headless** — chatgpt.com's
Cloudflare check walls a headless launch behind a "Just a moment…"
interstitial even with valid session cookies; the spawn renders into the
Xvfb display `aixel-xvfb` already runs (`CHATGPT.DISPLAY`, default `:99`).
`busy` (module-level) serializes calls so two spawns never race for the same
profile dir. **Needs a headful-browser host** — every endpoint (including
`/health`) refuses unless an X display is present (`assertBrowserRuntime`,
auto-detected from the Xvfb socket at `/tmp/.X11-unix/X<n>` for
`CHATGPT.DISPLAY`; also refused on Vercel), so a local `pnpm dev` or a Vercel
deployment can't accidentally drive a browser session that isn't there. No
env flag to set — the old `AIXEL_VPS=1` gate is gone.

If the profile's ChatGPT login expires, re-authenticate by temporarily
running Chrome headed against the same profile dir + display and signing in
by hand (e.g. via the `aixel-novnc` VNC endpoint), then let this module
resume spawning against it.

## Endpoints

| Method | Path | Role |
|--------|------|------|
| `GET` | `/chatgpt/health` | Static checks (binary, profile dir) + one real spawn+login check |
| `POST` | `/chatgpt` | One ChatGPT turn (sync; may take many minutes for an image) |
| `POST` | `/chatgpt/image` | One image through the Codex CLI, no browser ([below](#image-via-the-codex-cli-post-chatgptimage)) |

Also exposed as the `chatgpt` MCP tool — op `ask` (`POST /chatgpt`) and op
`image` (`POST /chatgpt/image`), same request/response shapes, same services.

## Accounts

Every request takes an optional `account` name (letters, digits, `_`, `-`);
omitted = `CHATGPT_DEFAULT_ACCOUNT`. An unknown name is a `400` listing the
known ones. The map comes from `CHATGPT_ACCOUNTS` (JSON, Zod-validated at
boot; set in the VPS `.env`, never in this public repo):

```json
{
  "work": {
    "profile_dir": "/home/ubuntu/browser-vnc/work",
    "codex_home": "/home/ubuntu/.codex-work",
    "general_project_url": "https://chatgpt.com/g/g-p-…/project"
  },
  "personal": { "profile_dir": "/home/ubuntu/browser-vnc/personal" }
}
```

- `profile_dir` — Chrome profile holding that account's chatgpt.com login (op `ask`).
- `codex_home` — that account's Codex CLI login (op `image`); absent = no CLI login.
- `general_project_url` — where a new `ask` with no `project_url` opens, so
  tool traffic stays out of the owner's own sidebar; absent = plain chat.

Unset (or invalid, with a boot warning) = one built-in account `default` on
`CHATGPT_PROFILE_DIR` / `CHATGPT_CODEX_HOME`, no project. A `project_url` or
`conversation_url` only opens in the account it belongs to.

## Staging a reference image

This module used to have its own `stage_image` op/`/chatgpt/stage` route —
removed. It was a plain HTTP download with zero ChatGPT-specific logic
(weaker than `media`'s own downloader, too — no gated-CDN fallback). For a
research flow that finds a viral post and wants to use its image as a
generation reference: call `media` op=fetch with `imageOnly: true` (validates
a real image content-type, enforces a size cap, names the file with the
right extension) and pass the returned `path` into this module's `images[]`.
Downloaded images land in `{AIXEL_MEDIA_ROOT}/private/media-fetched` — see
`media/README.md`.

## Request (`POST /chatgpt`)

```json
{
  "prompt": "…",
  "mode": "new",
  "project_url": "https://chatgpt.com/g/g-p-…/project",
  "conversation_url": null,
  "revise_notes": null,
  "images": null,
  "account": null,
  "attach_brand_logo": false,
  "timeout_seconds": null
}
```

- `prompt` and `mode` are the only required fields.
- `project_url` is **optional**. Give one when a project's saved instructions
  should shape the turn (house style, a brand, a persona); **omit it to run in
  the account's `general_project_url`, or a plain chat when it has none** (see
  [Accounts](#accounts)).
- `mode: "revise"` requires `conversation_url` from a prior success and
  continues that conversation, **with or without a project**. The response's
  `conversation_url` is what you pass back, so a plain-chat thread is reusable
  exactly like a project one.
- `conversation_url` in the response keeps the path the conversation actually
  lives at, so a project conversation comes back as
  `/g/g-p-…/c/…` rather than a bare `/c/…`.
- `images`: absolute local file paths attached to the message as real input
  images, in order. **Omit or pass `[]` to attach nothing.** Content type is
  taken from the file extension.
- `attach_brand_logo` (default `false`): also attach `CHATGPT_LOGO_PATH`. That
  file is **one organisation's mark**, so it is opt-in — a caller for a
  different brand, or for a standalone channel, must not silently inherit it.
- `timeout_seconds`: cap on waiting for the stream, defaulting to the server's
  own. A hung turn holds the single-call lock for this long.
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

## Image via the Codex CLI (`POST /chatgpt/image`)

The same subscription's image model, reached through `codex exec` with the
account's `codex_home` (signed in once: `CODEX_HOME=<home> codex login
--device-auth`) — for an account that is not signed into the VPS Chrome. It
draws on the plan's small monthly Codex allowance, not the browser's in-app
image cap, so prefer `POST /chatgpt` where the account has a browser login.
Refused on Vercel (`assertPersistentDisk`); no X display needed.

```json
{
  "prompt": "…",
  "mode": "new",
  "session_id": null,
  "revise_notes": null,
  "images": ["/abs/path/reference.png"],
  "account": "work",
  "instructions_file": "/abs/path/brand.md",
  "timeout_seconds": 600
}
```

- `prompt` is the only required field; `mode` defaults to `new`. Unknown keys
  are rejected.
- `mode: "revise"` requires `session_id` from a prior success and resumes that
  CLI session, so only what is asked changes.
- `instructions_file`: standing instructions put in front of the prompt on
  `new` — the stand-in for a ChatGPT Project, which the CLI cannot open.
- Response `data`: `{ media_url, session_id, text? }` — always an image; a turn
  that made none fails (`502`) with what the CLI said (usage limit, refusal).
  Signed out / CLI missing → `503`; a concurrent call → `409`. Does not block
  or wait for `POST /chatgpt`.

## Smoke

```bash
curl -sS http://127.0.0.1:8002/chatgpt/health | jq .

# No project at all — plain chat, nothing attached
curl -sS -X POST http://127.0.0.1:8002/chatgpt \
  -H 'content-type: application/json' \
  -d '{
    "prompt":"In one sentence, what makes a SaaS landing page convert?",
    "mode":"new"
  }' | jq .

# Continue that same plain-chat thread (no project involved)
curl -sS -X POST http://127.0.0.1:8002/chatgpt \
  -H 'content-type: application/json' \
  -d '{
    "prompt":"Now say it for a developer tool.",
    "mode":"revise",
    "conversation_url":"https://chatgpt.com/c/…"
  }' | jq .

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
    "images":["/home/ubuntu/AIXEL-LABS-ORG/brand/assets/aixellabs-lockup.png","/home/ubuntu/media/private/media-fetched/example-viral-post.jpg"]
  }' | jq .

# Image through the Codex CLI
curl -sS -X POST http://127.0.0.1:8002/chatgpt/image \
  -H 'content-type: application/json' \
  -d '{"prompt":"Flat-vector illustration of an empty inbox, square.","mode":"new"}' | jq .
```
