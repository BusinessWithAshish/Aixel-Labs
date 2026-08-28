# Cursor rules (governors)

**Rules constrain; skills execute.** Rules are shared governing bodies — **not** 1:1 with skills.

How Cursor uses AGENTS / rules / skills: [`.cursor/README.md`](../README.md) · [docs](https://cursor.com/docs/rules.md).

Attachment is via each `.mdc` frontmatter (`globs` / `description` / `alwaysApply`). Folders are for humans; Cursor discovers nested `.mdc` files. Plain `README.md` files here are **ignored** by the rules engine (use AGENTS.md for plain markdown instructions).

## Categories

| Folder | Role |
|--------|------|
| [`frontend/`](frontend/) | FE governors (`code/`, `auth`, `mutations`, `business/`) |
| [`backend/`](backend/) | BE governors (platform, db, api, utils, mcp) |
| [`external/`](external/) | Rare vendor usage governors — **not** one rule per external skill |
| [`common/`](common/) | Cross-cutting governors only if needed |

## Frontend governors

| Rule | Owns |
|------|------|
| [`frontend/code/ui.mdc`](frontend/code/ui.mdc) | Components, FeatureFlagGate placement |
| [`frontend/code/page-shell.mdc`](frontend/code/page-shell.mdc) | PageProvider / contexts |
| [`frontend/code/modules.mdc`](frontend/code/modules.mdc) | Hooks, helpers (non lead-gen credits), non-auth lib |
| [`frontend/code/surfaces.mdc`](frontend/code/surfaces.mdc) | API BFF + config/middleware |
| [`frontend/auth.mdc`](frontend/auth.mdc) | Session/membership / `lib/auth` / firebase |
| [`frontend/mutations.mdc`](frontend/mutations.mdc) | Server actions (excl. auth-actions), debit, cascade |
| [`frontend/business/lead-generation.mdc`](frontend/business/lead-generation.mdc) | Credits, scrape pipeline, lead forms |
| [`frontend/business/tenants.mdc`](frontend/business/tenants.mdc) | Manage-tenants admin isolation |

## Backend governors

| Rule | Owns |
|------|------|
| [`backend/platform.mdc`](backend/platform.mdc) | `config.ts` / `routes.ts` / `server.ts` mounts + boot |
| [`backend/db.mdc`](backend/db.mdc) | **Schema SSOT** — `src/db` collections, Doc types, `LeadData`, module enums |
| [`backend/api.mdc`](backend/api.mdc) | Express scrapers under `src/api` |
| [`backend/utils.mdc`](backend/utils.mdc) | Shared TLS/proxy/location utils (BE-only) |
| [`backend/mcp.mdc`](backend/mcp.mdc) | MCP Streamable HTTP — domain tools (`op`/`layer`/`input`) → services |

## Layered attachment

Multiple rules may attach to one file when roles differ (e.g. lead-card → `ui` + `lead-generation`). The **same hard rule** must live in exactly one governor.

## Unruled skills

External and common skills (`botasaurus`, `ai-sdk`, `ponytail`, `dry-module-cleanup`, …) have **no** project rule unless we later need an in-repo usage constraint.

Skill ↔ governor map: [`frontend/AGENTS.md`](../../frontend/AGENTS.md), [`backend/AGENTS.md`](../../backend/AGENTS.md), and [`.cursor/skills/README.md`](../skills/README.md).
