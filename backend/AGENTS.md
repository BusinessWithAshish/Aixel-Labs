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
- **`src/db` is schema SSOT.** New persisted features start in `types.ts`.
- Disk: `src/media.ts` (`AIXEL_MEDIA_ROOT`) — `{root}/public` vs `{root}/private/…`.
- Runtime guards in `config.ts`: `IS_VERCEL_RUNTIME` (auto) blocks disk-output
  ops on Vercel; `IS_VPS_RUNTIME` (`AIXEL_VPS=1`, explicit) gates the
  `chatgpt`/`claude` modules to the VPS only, local dev included. Use
  `assertPersistentDisk` / `assertVpsRuntime` at the top of the service
  function, not the route — MCP ops call the same function.
- APIs return `ALApiResponse<T>`; Zod validates **requests** only.
- **No Mongo inside `src/api`.** Utils are BE-only (no FE package export).
- MCP: one tool per domain (`op` / `layer` / `input`) calling the same
  **services** as HTTP — no loopback. Catalog: `backend/src/mcp/README.md`.

Mirror `src/api/crawl/` for a new single-endpoint module.
