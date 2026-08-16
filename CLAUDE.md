# Aixel Labs — Claude Code entry point

**This file is a pointer, not a copy.** The authoritative instructions live in
[`AGENTS.md`](AGENTS.md) and under [`.cursor/`](.cursor/). Do not duplicate
content here — if guidance is missing, add it to the right place below so every
agent (Cursor, Claude Code, Hermes/Killjoy) picks up the same source.

## Read these first

1. **[`AGENTS.md`](AGENTS.md)** (repo root) — stack, monorepo layout, commands.
   Also read the nested one for the tree you are working in:
   [`frontend/AGENTS.md`](frontend/AGENTS.md) or
   [`backend/AGENTS.md`](backend/AGENTS.md). More specific wins.

2. **Rules — `.cursor/rules/**/*.mdc`** — hard constraints. Check the folder
   matching your work before you edit: `backend/`, `frontend/`, `common/`,
   `external/`. These are short; read the relevant ones in full.

3. **Skills — `.cursor/skills/**/SKILL.md`** — step-by-step workflows, grouped
   the same way. Each folder name equals the skill's YAML `name`. **Before
   implementing anything non-trivial, list the skills for the area you are
   touching and read any whose `description` matches the task.**

```bash
ls .cursor/rules/backend .cursor/rules/frontend
ls .cursor/skills/backend .cursor/skills/frontend .cursor/skills/common
```

## Division of responsibility

| Layer | Location | Role |
|---|---|---|
| AGENTS.md | root + `frontend/` + `backend/` | map, stack, commands, pointers |
| Rules | `.cursor/rules/**/*.mdc` | hard constraints when matching files are in play |
| Skills | `.cursor/skills/**/SKILL.md` | how to build/refactor, step by step |

Schema SSOT for persisted data is `backend/src/db` — see skill `backend-db`.

## Working agreements

- **Follow the existing skill for the area.** If a skill covers what you are
  doing, follow it rather than inventing an approach. Say which skill you used.
- **Match surrounding code** — its naming, structure, and idiom.
- **Stay in scope.** Change only what the task asks for. Never touch the org
  root above this repo.
- **Do not commit** unless explicitly asked.
- This repo is also edited from Cursor on a local machine. Keep changes
  conventional and reviewable; assume a human reads the diff.
