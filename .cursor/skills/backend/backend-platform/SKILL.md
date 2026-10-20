---
name: backend-platform
description: >-
  Backend process wiring: config.ts (ENDPOINTS / API_ENDPOINTS / CORS), routes.ts
  (app.use mounts), server.ts (middleware, dotenv, rate limit, Vercel export).
  Use whenever adding or changing a product mount, MCP base path, ping/CORS/rate
  limit, how the Express app boots locally vs on Vercel, or how the VPS backend
  is split into services and deployed (backend/deploy/: AIXEL_LABS_SERVICE,
  releases, slots, Caddy switch, rollback, adding a service, the Python voice
  service in backend/voice).
  Required context for any backend route or server change.
---

# Backend platform (`config` / `routes` / `server`)

Must-know wiring for **any** backend change that mounts a path, boots the
process, or exposes URLs to the frontend.

## Ownership

| File | Owns |
|------|------|
| `backend/src/config.ts` | `ENDPOINTS` enum, `API_ENDPOINTS` (`route` + `full`), CORS origin regexes |
| `backend/src/routes.ts` | `registerRoutes(app)` — `app.use(ENDPOINTS.*, router)` only |
| `backend/src/server.ts` | `dotenv/config` first, middleware stack, ping, `registerRoutes`, Vercel `export = app` vs local `listen` |

Product handlers live under `api/` or `mcp/` — they **do not** invent parallel
path constants. FE product calls use `API_ENDPOINTS.*.full` from
`@aixellabs/backend/config`.

## `ENDPOINTS` vs `API_ENDPOINTS`

```ts
ENDPOINTS.FACEBOOK = "/facebook"           // Express mount base
API_ENDPOINTS.FACEBOOK.API.route = "/"     // path on that router
API_ENDPOINTS.FACEBOOK.API.full = "/facebook"  // FE / apiClient path
```

- Module routers register with `.route`.
- Frontend (`lead-gen-api`, etc.) posts to `.full`.
- Subpaths often imported from module constants (YouTube, Trends, IG advanced, GMaps).
- `SAMPLE` exists in config but is **not** mounted in `routes.ts` — don’t assume every enum value is live.

## Middleware order (`server.ts`)

1. `trust proxy` (`TRUST_PROXY` or `VERCEL` → `1`)
2. `helmet`, disable `x-powered-by`
3. `cors` (dev/prod regexes; MCP headers allowed)
4. `express.json` (5mb)
5. `morgan`
6. `express.static(public)`
7. Global `rateLimit` (`RATE_LIMIT_MAX` or 100 / 15m) — loopback callers (127.0.0.1 / ::1: local agents, cron, MCP on this host) are exempt via `skip`; public traffic arrives through Caddy with `TRUST_PROXY=1`, so `req.ip` is the real client and cannot be spoofed to loopback
8. `GET API_ENDPOINTS.PING` (`/v1/ping`) — extra-tight limit
9. API secret gate — with `AIXEL_API_SECRET` set, remote callers must send it (`API_SECRET_HEADER`, `Authorization: Bearer`, or `/mcp?key=`); callers on this host and `API_SECRET_EXEMPT_PATHS` (token-gated upload steps) pass. Unset = open (local dev only)
10. `registerRoutes(app)` — mounts only what this process serves (`AIXEL_LABS_SERVICE`, see Services)
11. `export = app`; if not `VERCEL`, `listen(PORT || 8002)` and a SIGTERM handler that drains (see Deploy)

**`import "dotenv/config"` must be first** so `PROXY_CONFIG` and other env-baked
constants see variables.

## New HTTP product mount checklist

1. Build module under `api/<name>/` (`backend-api-module`).
2. Add `ENDPOINTS` + `API_ENDPOINTS` in `config.ts`.
3. `app.use(ENDPOINTS.…, routes)` in `routes.ts`.
4. Optional `package.json` exports for FE schemas/types.
5. Optional MCP → `backend-mcp` (same service, no loopback; add an `op` on
   the domain tool, do not register a new MCP tool per HTTP route).

## New MCP base path

Default stays `/mcp`. Extra servers: path-split under the MCP router **or** new
`ENDPOINTS` + `routes.ts` entry (`backend-mcp` skill).

## Env (platform)

| Var | Effect |
|-----|--------|
| `NODE_ENV` | CORS set, morgan format |
| `PORT` | Local listen (default 8002). On the VPS each slot's unit sets its own (see Services). |
| `AIXEL_LABS_SERVICE` | Which part of the backend this process serves: `api` (every module and MCP), `games` (Big Business + Bluff room routes and WebSockets). Unset (local dev, Vercel) = everything. Read in `routes.ts` (`servesApi` / `servesGames`); each VPS unit sets it. |
| `HOST` | Local listen bind address (default `127.0.0.1` — loopback only; the VPS's Caddy reverse-proxies from there). Set `0.0.0.0` to expose on the LAN. |
| `VERCEL` | Auto-set by Vercel. Skip `listen`; trust proxy default. Also refuses (501) any op that writes local disk expecting it to persist — `media` `fetch`/`cut`/`condense`, `youtube` `video_download` (`IS_VERCEL_RUNTIME` in `config.ts`). Does **not** skip product mounts or MCP tools. |
| _(browser host)_ | **No env var.** The `chatgpt`/`gemini` modules (headful Chrome/CDP) are gated by `assertBrowserRuntime` in `config.ts`, which auto-detects a usable host: an X display must be present (Xvfb socket at `/tmp/.X11-unix/X<n>` for the module's `DISPLAY`, default `:99`) and it must not be Vercel. The VPS's `aixel-xvfb` unit provides that display, so nothing is configured; Vercel and any host without an X server refuse browser ops on their own. Replaced the old hand-set `AIXEL_VPS=1` flag. **Not** used by `claude` — that module shells to the `claude` CLI, which runs on any machine it's installed and authenticated on and fails with a plain error otherwise. |
| `TRUST_PROXY` | Override trust proxy |
| `RATE_LIMIT_MAX` | Global limiter |
| `AIXEL_MEDIA_ROOT` | **Single root for every on-disk media path** (`src/media.ts`, `AIXEL_MEDIA` const). Unset → `cwd/storage` (local/dev). VPS systemd: `/home/ubuntu/media`. Every subdir — `media` `cut`/`condense`/`fetch` output, `youtube` `video_download`, `chatgpt`'s staged reference images (`refs/`) — is a fixed subpath derived from this one root; none of them has its own override env var. Repoint the whole tree by changing this one var, not by adding a new one. |
| `AIXEL_MEDIA_PUBLIC_BASE` | Public URL prefix for staged files (default `https://hermes.aixellabs.in/media`) |
| `CHANNEL_API_KEYS_DIR` | Folder of per-channel `<slug>.json` Gemini/Groq key files (`src/channel-keys.ts`), outside the repo. Unset → the `channel` field is ignored and the shared keys are used. VPS systemd sets it. |

Proxy scrape env (`EVOMI_*`) is documented under `backend-utils`.

## Services (VPS)

The backend runs as separate processes, one per service, so a deploy of one never
restarts another. Same code, same folders: `AIXEL_LABS_SERVICE` picks what a Node process
mounts; `voice` is the Python voice engine in `backend/voice/` (its own README). Caddy
routes `api.aixellabs.in` (and the local `127.0.0.1:8002`) by path.

| Service | Serves | Caddy paths | Slots (`aixel-labs-<service>@<port>`) | Drains on SIGTERM until |
|---|---|---|---|---|
| `api` | every REST module, `/mcp`, media | everything else | `8101` / `8102` | in-flight requests answer (`TimeoutStopSec=65min`, media jobs) |
| `games` | `/business/*`, `/bluff/*` (rooms + `/…/ws`) | `/business/*`, `/bluff/*` | `8111` / `8112` | its running matches end (`TimeoutStopSec=2h`) |
| `voice` | `backend/voice/phone.py` (Python): carrier webhooks, call media WebSockets, the app's `/calls` + `/play`, campaigns | `/voice/*`, prefix stripped (`/docs`, `/redoc`, `/openapi.json` 404) | `8121` / `8122` | its running calls end and its campaign calls are settled (`TimeoutStopSec=1h`) |

**Games rooms are in memory only, by decision (no database, no snapshot).** A
games deploy therefore never moves a match: the old slot refuses new sockets,
drops lobby sockets (those players reconnect to the new slot) and keeps every
running match until it ends, then exits. A player whose own connection drops
during that window reconnects to the new slot and finds the room gone. An api
deploy does not touch the games at all; Caddy's `stream_close_delay 2h` keeps
match sockets open through every reload.

**Voice.** The engine checks every request itself (signed URLs, stream tokens, its key), so
Caddy sends `/voice/*` straight to it, not through Node. Its unit sets
`PUBLIC_HOST=api.aixellabs.in/voice` (every URL it hands to a carrier) and reads the database
from the untracked `backend/voice/service.env`; keys are in the untracked `backend/voice/.env`.
On SIGTERM `phone.py` drains instead of uvicorn's stop (which would close every call's socket):
no new calls (`/texml` / `/twiml` answer with a short apology, `/play` and a VoiceLink call coming
in are refused, `POST /calls` is 503 `code: "draining"`, the campaign loop dials nobody and lets
go of its campaign leases), `/health` turns 503, running calls go on, and it exits when nothing
is left. While both slots run, contacts are claimed atomically (never dialled twice), and a
Telnyx event for a call the other slot holds is handed to it (`SLOT_PORTS`). Caddy's
`stream_close_delay 1h` matches its `TimeoutStopSec`.

## Deploy (VPS)

Zero downtime, one command, from `backend/`:

```bash
deploy/deploy.sh                    # origin/main (fetched first): only the services whose files changed
deploy/deploy.sh <sha|ref>          # any commit, same rule
deploy/deploy.sh <sha|ref> games    # exactly these services; an older built sha is a rollback
deploy/deploy.sh --plan [sha|ref]   # print which services would deploy, change nothing
```

**Which services a commit redeploys** (`affects` in `deploy.sh`): `games` owns
`src/api/business/`, `src/api/bluff/` and `src/api/game-sockets.ts`; `voice` owns
`backend/voice/`; `api` owns everything else under `backend/`; the Node boot code
(`server.ts`, `routes.ts`, `config.ts`, `package.json`, `tsconfig.json`,
`pnpm-lock.yaml`) redeploys `api` and `games`; a service's own unit file redeploys it. `*.md` and the rest
of `deploy/` redeploy nothing (`deploy/Caddyfile` is installed on its own, below).

For each service, `deploy.sh` does, in order:

1. **Build** the commit once into `backend/releases/<sha>/` (`git archive` + `pnpm install --frozen-lockfile` + `tsc`), shared by every service. The checkout's own `dist/` is never touched, and only committed code deploys. Untracked runtime files stay in the checkout and are symlinked into every release: `backend/.env`, each `workers/<name>/` venv, `models/` and binaries, and everything untracked in `backend/voice/` (`.venv`, `.env`, `service.env`, `prompt.md` and its runtime state: `calls/`, `cache/`, `suppressed.jsonl`, `turns.jsonl`, created first if missing so a release never keeps its own copy).
2. **Start** the idle slot (template `backend/deploy/aixel-labs-<service>@.service`, installed by the script). `releases/slot-<service>-<port>` points at the release it runs.
3. **Health check**: the service's health path (`/v1/ping`; voice: `/health`) must return 200 within 120 s. Otherwise the new slot is stopped and the live one is untouched.
4. **Switch**: rewrite the one line in `/etc/caddy/aixel-labs-<service>.upstream` (`to 127.0.0.1:<port>`) and `systemctl reload caddy` (graceful).
5. **Drain**: SIGTERM to the old slot, then move on without waiting. `server.ts` stops accepting, keeps sweeping idle keep-alive connections (Caddy pools them) and connections that never sent a request (closed 5 s after opening); without the sweep either would make the slot sit out `TimeoutStopSec`, and exits once in-flight requests answer and, in `games`, running matches end. `KillMode=mixed` keeps a media job's ffmpeg / Python children alive meanwhile.
6. **Clean up**: when a slot exits, its `ExecStopPost` runs `deploy.sh --prune`, which removes the links of stopped slots that are no longer live (the live slot is the enabled one, and keeps its link through a restart or crash) and every release outside the 3 most recently deployed, never one a slot still runs.

Then `deploy/Caddyfile` **at that commit** is validated and installed if it differs
from `/etc/caddy/Caddyfile`. Change Caddy only through that file.

**Port 8002 is Caddy, not Node.** Hermes MCP configs, cron scripts and Claude Code dial `127.0.0.1:8002`; Caddy serves that address (loopback only) and strips `X-Forwarded-For`, so those callers are still local callers (no API key, outside the public rate limit). Never run a backend on 8002.

**Changed `.env` or another untracked runtime file?** Run `deploy.sh <sha it runs> <service>`: naming a service always starts a fresh slot, even of the sha already live. Never `systemctl restart` a live slot for it: the service is down until it is back up (it does come back, since the live, enabled slot keeps its release link).

Don't `systemctl restart` a slot by hand while it is live, and don't bring back the old single `aixel-backend.service` or the `aixel-backend@` slots (nor the voice engine's old `voicelab.service` and its tunnel). Logs: `journalctl -u aixel-labs-<service>@<port>`.

### Adding a service

1. Give it an owned path and, for a Node service, a value of `AIXEL_LABS_SERVICE` read in `routes.ts` / `server.ts`.
2. Add `deploy/aixel-labs-<service>@.service`: instance = port, `WorkingDirectory=…/releases/slot-<service>-%i/…`, the `ExecStopPost` prune line, a `TimeoutStopSec` above its longest in-flight work. SIGTERM must mean: stop taking new work, finish what is running, exit.
3. In `deploy.sh`: add it to `SERVICES`, `SLOTS` (two free ports), `HEALTH` (a path that answers 200 from loopback) and `OWNS`. A Python service links its untracked venv into each release the way `workers/` does.
4. In `deploy/Caddyfile`: a snippet importing `/etc/caddy/aixel-labs-<service>.upstream` and a path matcher. WebSockets that must outlive a reload need `stream_close_delay`.
5. Commit, then `deploy.sh <sha> <service>` first: the Caddyfile is only installed once every upstream it imports exists.

## Do / don’t

- DO change mounts only via `config.ts` + `routes.ts`.
- DO keep FE paths aligned with `API_ENDPOINTS.*.full`.
- DON’T hardcode product base paths in FE helpers when config already exports them.
- DON’T call `listen` on Vercel — keep `export = app`.
- DON’T skip product mounts or MCP tools when `VERCEL` is set.
- DON’T move `dotenv` below modules that read `process.env` at import time.
- DO deploy with `backend/deploy/deploy.sh` (VPS); DON’T build into the live `dist/` and restart a unit.
- DO keep the games rooms in memory; a games deploy waits for matches instead of moving them.
- DO keep the voice engine's keys and runtime state untracked in the checkout's `backend/voice/` (linked into releases); never in a release, never committed (the repo is public).

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/platform.mdc` |
| API modules | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| MCP | `.cursor/skills/backend/backend-mcp/SKILL.md` |
| Utils / proxy env | `.cursor/skills/backend/backend-utils/SKILL.md` |
| DB schema | `.cursor/skills/backend/backend-db/SKILL.md` |
