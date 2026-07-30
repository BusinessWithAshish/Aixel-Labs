# `.cursor/` — agent customization

Project rules and skills for [Cursor](https://cursor.com/docs). Product overview:
[`../README.md`](../README.md). Repo agent map: [`../AGENTS.md`](../AGENTS.md).

## Three layers (do not merge them)

```text
AGENTS.md (root + frontend/ + backend/)
  └── always-on map for that tree

.cursor/rules/**/*.mdc
  └── governors (globs / alwaysApply) — short hard constraints

.cursor/skills/**/SKILL.md
  └── executors — detailed “how to build X” (description-triggered or /name)
```

| Question | Answer |
|----------|--------|
| One AGENTS.md or many? | **Both.** Thin **root** for monorepo; nested `frontend/` + `backend/` for package detail ([docs](https://cursor.com/docs/rules.md#agentsmd)). |
| Does root AGENTS replace FE/BE? | **No.** Root = repo tooling + pointers. Nested = stack, boundaries, skill/rule indexes. |
| Skills vs rules? | Rules constrain; skills execute. Not 1:1. |
| Skill folder naming? | Leaf folder that contains `SKILL.md` **must** match YAML `name:` ([docs](https://cursor.com/docs/skills.md)). |

## Folders

| Path | Contents |
|------|----------|
| [`skills/`](skills/) | Executors (`frontend/`, `backend/`, `external/`, `common/`) |
| [`rules/`](rules/) | Governors (same categories; `.mdc` only — plain `README.md` here is ignored by the rules engine) |

## Indexes

- Skills: [`skills/README.md`](skills/README.md)
- Rules: [`rules/README.md`](rules/README.md)
- FE map: [`../frontend/AGENTS.md`](../frontend/AGENTS.md)
- BE map: [`../backend/AGENTS.md`](../backend/AGENTS.md)
