# Aixel Labs — agent instructions (repo root)

Monorepo guidance for Cursor Agent. Package-specific detail lives in nested
[`frontend/AGENTS.md`](frontend/AGENTS.md) and [`backend/AGENTS.md`](backend/AGENTS.md)
(applied when working under those trees). Skills and rules live under [`.cursor/`](.cursor/).

## How Cursor uses these files

| Layer | Location | Role |
|-------|----------|------|
| **AGENTS.md** | Root + `frontend/` + `backend/` | Always-on instructions for that directory tree (no frontmatter). Nested files combine with parents; more specific wins. |
| **Rules** | `.cursor/rules/**/*.mdc` | Governors — constraints via `globs` / `alwaysApply` / description. Short hard rules. |
| **Skills** | `.cursor/skills/**/SKILL.md` | Executors — on-demand workflows; agent matches `description` (or `/skill-name`). Folder name **must** equal YAML `name`. |

Do **not** duplicate long procedures in AGENTS, rules, and skills. Pattern:

- **AGENTS** → map, stack, commands, pointers  
- **Rules** → hard constraints when matching files are in play  
- **Skills** → how to build/refactor step by step  

Docs: [Rules / AGENTS.md](https://cursor.com/docs/rules.md), [Skills](https://cursor.com/docs/skills.md).

## Monorepo layout

| Package | Role |
|---------|------|
| `frontend/` | Next.js app (port 3003) — UI, auth, credits, lead-gen, BFF |
| `backend/` | Express scrapers + intelligence + MCP; Mongo schema SSOT in `src/db` |
| `browser-worker/` | Optional Puppeteer worker (not required for current `/gsearch`) |
| `scraper/` | Legacy/sidecar Python Botasaurus service |

Schema SSOT for persisted data: `backend/src/db` → skill `backend-db`.

## Commands

```bash
pnpm installAll          # frontend + backend + browser-worker
pnpm --filter frontend dev
pnpm --filter backend run dev
pnpm --filter browser-worker run dev
```

Align `BE_API` with the backend listen port (default **8002** unless overridden).

## Agent map (pointers only)

| Concern | Start here |
|---------|------------|
| FE product / UI | `frontend/AGENTS.md` + `.cursor/skills/frontend/` |
| BE APIs / MCP / utils / mounts | `backend/AGENTS.md` + `.cursor/skills/backend/` |
| DB schema | `.cursor/skills/backend/backend-db/SKILL.md` |
| Indexes of skills/rules | [`.cursor/skills/README.md`](.cursor/skills/README.md), [`.cursor/rules/README.md`](.cursor/rules/README.md) |
| This folder explained | [`.cursor/README.md`](.cursor/README.md) |

## Cross-cutting don’ts

- Do not invent FE Doc / `LeadData` / module enums — change `backend/src/db/types.ts` first.
- Do not put Mongo writes in `backend/src/api` scrapers.
- Do not debit credits on scrape BFF — only in `createUserLeads` after success.
- Prefer existing skills over inventing parallel conventions.
