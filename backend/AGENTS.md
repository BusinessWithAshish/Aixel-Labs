# Backend agent notes

Combined with root [`AGENTS.md`](../AGENTS.md) when working under `backend/`
([nested AGENTS.md](https://cursor.com/docs/rules.md#agentsmd)).

How skills/rules attach: [`.cursor/README.md`](../.cursor/README.md).

Agents changing backend code should know these surfaces. Start with **platform**
for mounts/boot, **db** for anything persisted, then the folder you are editing.

## Skills & rules (SSOT pointers)

| Concern | Skill | Rule |
|---------|-------|------|
| **Process wiring** (`config` / `routes` / `server`) | `.cursor/skills/backend/backend-platform/SKILL.md` | `.cursor/rules/backend/platform.mdc` |
| **DB schema** / collections / `LeadData` / modules | `.cursor/skills/backend/backend-db/SKILL.md` | `.cursor/rules/backend/db.mdc` |
| Express scraper APIs (`src/api`) | `.cursor/skills/backend/backend-api-module/SKILL.md` | `.cursor/rules/backend/api.mdc` |
| Shared scrape utils (`src/utils`) | `.cursor/skills/backend/backend-utils/SKILL.md` | `.cursor/rules/backend/utils.mdc` |
| MCP (`/mcp` tools → services) | `.cursor/skills/backend/backend-mcp/SKILL.md` | `.cursor/rules/backend/mcp.mdc` |

## Quick facts

- Mounts: `ENDPOINTS` + `API_ENDPOINTS` in `config.ts`, then `app.use` in `routes.ts`.
  FE calls `API_ENDPOINTS.*.full` via `@aixellabs/backend/config`.
- `server.ts`: `dotenv` first → middleware → `registerRoutes` → Vercel `export = app`.
- On the VPS the backend runs as services, one process each (`AIXEL_LABS_SERVICE`:
  `api`, `games`; plus `voice`, the Python voice engine in `voice/`), deployed one at a
  time with zero downtime by `deploy/deploy.sh`. Never restart a unit by hand. See the
  `backend-platform` skill (Services, Deploy).
- Voice engine: `voice/` (Python, Pipecat + Gemini Live), served at `/voice/*`; its own
  venv, tests and README; keys and runtime state untracked (allowlist `.gitignore`).
  Persisted `voice_*` shapes still start in `src/db/types.ts`.
- **`src/db` is schema SSOT.** New persisted features start in `types.ts`.
- Disk: `src/media.ts` (`AIXEL_MEDIA_ROOT`) — `{root}/public` vs `{root}/private/…`.
- Per-channel keys: `src/channel-keys.ts` (`CHANNEL_API_KEYS_DIR`) — ops that take
  `channel` resolve that channel's own Gemini/Groq key inside the service; callers
  pass only the slug, never a key.
- Runtime guards in `config.ts`: `IS_VERCEL_RUNTIME` (auto) blocks disk-output
  ops on Vercel; `IS_VPS_RUNTIME` (`AIXEL_VPS=1`, explicit) gates the
  `chatgpt`/`claude` modules to the VPS only, local dev included. Use
  `assertPersistentDisk` / `assertVpsRuntime` at the top of the service
  function, not the route — MCP ops call the same function.
- APIs return `ALApiResponse<T>`; Zod validates **requests** only.
- **No Mongo inside `src/api`.** Utils are BE-only (no FE package export).
- Auth: with `AIXEL_API_SECRET` set, `server.ts` rejects remote callers that do not
  present it (header `API_SECRET_HEADER`, `Authorization: Bearer`, or `/mcp?key=`).
  Callers on this host are exempt. Routes have no auth of their own — never expose
  the API without it.
- MCP: one tool per domain (`op` / `layer` / `input`) calling the same
  **services** as HTTP — no loopback. Catalog: `backend/src/mcp/README.md`.

- Puppeteer: `src/browser/` — real-Chrome Google Search and Maps scraping, parked and
  unmounted as the fallback when TLS + Evomi gets blocked. Read its README before wiring it.
- Python worker: `workers/reframe/` — speaker-following crop plans for `media`
  op=`cut` (`reframe: "speaker"`). Own venv + models via `pnpm setup:reframe`,
  spawned per clip from `src/api/media/cut/reframe.ts`; analysis only, the
  render stays in ffmpeg. Outside `tsc` (`include: ["src"]`).
- Caption ear: `workers/asr/` — whisper.cpp + a Hinglish Whisper model, run
  by `src/api/media/caption/ear.ts` for `media` op=`caption` `listener: "apex"`
  (sharing the align worker's one-at-a-time queue). Set up with `pnpm setup:asr`.
- Python worker: `workers/align/` — forced alignment of caption words to the
  clip's audio for `media` op=`caption` (the `timing: "aligned"` in its
  response). Own venv + model via `pnpm setup:align`, spawned per clip, one at a
  time, from `src/api/media/caption/align.ts`. Outside `tsc`.

Mirror `src/api/crawl/` for a new single-endpoint module.
