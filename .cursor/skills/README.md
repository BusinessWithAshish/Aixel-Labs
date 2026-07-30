# Cursor skills

Project agent skills for Aixel Labs. **Skills = executors** (build / refactor / edit).
**Rules = shared governors** under [`.cursor/rules/`](../rules/) — not 1:1 with skills.

How Cursor discovers skills/rules/AGENTS: [`.cursor/README.md`](../README.md) · root [`AGENTS.md`](../../AGENTS.md).

**Naming:** the folder that contains `SKILL.md` must equal the YAML `name:` field
([Cursor skills docs](https://cursor.com/docs/skills.md)).

## Categories

| Folder | Purpose |
|--------|---------|
| [`external/`](external/) | Vendor / downloaded / upstream SDK skills (**usually unruled**) |
| [`frontend/`](frontend/) | Aixel FE executors (`code/`, `auth/`, `mutations/`, `business/`) |
| [`backend/`](backend/) | Aixel BE executors (platform, db, api, utils, mcp) |
| [`common/`](common/) | Cross-cutting (**usually unruled**) |

### Frontend layout

| Subfolder | Skills (`name` = leaf folder) |
|-----------|-------------------------------|
| [`code/`](frontend/code/) | `frontend-code-components`, `…-page-shell`, `…-hooks`, `…-api-routes`, `…-config`, `…-feature-flags` |
| [`auth/`](frontend/auth/) | `frontend-auth-session` |
| [`mutations/`](frontend/mutations/) | `frontend-mutations-server-actions` |
| [`business/`](frontend/business/) | `frontend-business-lead-generation`, `frontend-business-tenants` |

### Backend layout

| Subfolder | Skills |
|-----------|--------|
| [`backend-platform/`](backend/backend-platform/) | mounts + boot (`config` / `routes` / `server`) |
| [`backend-db/`](backend/backend-db/) | Mongo schema SSOT |
| [`backend-api-module/`](backend/backend-api-module/) | Express scraper pattern |
| [`backend-utils/`](backend/backend-utils/) | TLS/proxy/location (BE-only) |
| [`backend-mcp/`](backend/backend-mcp/) | Streamable HTTP MCP → services |

## Skill → governor (FE)

| Skill `name` | Folder | Governed by |
|--------------|--------|-------------|
| `frontend-code-components` | `frontend/code/frontend-code-components` | `.cursor/rules/frontend/code/ui.mdc` |
| `frontend-code-page-shell` | `frontend/code/frontend-code-page-shell` | `.cursor/rules/frontend/code/page-shell.mdc` |
| `frontend-code-hooks` | `frontend/code/frontend-code-hooks` | `.cursor/rules/frontend/code/modules.mdc` |
| `frontend-code-api-routes` | `frontend/code/frontend-code-api-routes` | `.cursor/rules/frontend/code/surfaces.mdc` |
| `frontend-code-config` | `frontend/code/frontend-code-config` | `.cursor/rules/frontend/code/surfaces.mdc` |
| `frontend-code-feature-flags` | `frontend/code/frontend-code-feature-flags` | `ui.mdc` (gate only); `flags.ts` skill-owned |
| `frontend-auth-session` | `frontend/auth/frontend-auth-session` | `.cursor/rules/frontend/auth.mdc` |
| `frontend-mutations-server-actions` | `frontend/mutations/frontend-mutations-server-actions` | `.cursor/rules/frontend/mutations.mdc` |
| `frontend-business-lead-generation` | `frontend/business/frontend-business-lead-generation` | `.cursor/rules/frontend/business/lead-generation.mdc` (+ layered ui/page-shell/surfaces/mutations) |
| `frontend-business-tenants` | `frontend/business/frontend-business-tenants` | `.cursor/rules/frontend/business/tenants.mdc` (+ layered) |

## Skill → governor (BE)

| Skill `name` | Folder | Governed by |
|--------------|--------|-------------|
| `backend-platform` | `backend/backend-platform` | `.cursor/rules/backend/platform.mdc` |
| `backend-db` | `backend/backend-db` | `.cursor/rules/backend/db.mdc` (**schema SSOT**) |
| `backend-api-module` | `backend/backend-api-module` | `.cursor/rules/backend/api.mdc` |
| `backend-utils` | `backend/backend-utils` | `.cursor/rules/backend/utils.mdc` |
| `backend-mcp` | `backend/backend-mcp` | `.cursor/rules/backend/mcp.mdc` |
| `external/*`, `common/*` | — | **No project rule** |

Prefer absolute paths in docs: `.cursor/skills/<category>/…/SKILL.md`.

Also: [`frontend/AGENTS.md`](../../frontend/AGENTS.md), [`backend/AGENTS.md`](../../backend/AGENTS.md).

**Cross-cutting:** Mongo schema SSOT is always `.cursor/skills/backend/backend-db/SKILL.md` — FE skills consume it; they do not redefine Doc / `LeadData` / module enums.
