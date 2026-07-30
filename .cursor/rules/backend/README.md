# Backend rules

Governors for backend paths. Skills under [`.cursor/skills/backend/`](../../skills/backend/) execute.

| Rule | Globs (summary) | Executor |
|------|-----------------|----------|
| [`platform.mdc`](platform.mdc) | `config.ts`, `routes.ts`, `server.ts` | `.cursor/skills/backend/backend-platform/SKILL.md` |
| [`db.mdc`](db.mdc) | `backend/src/db/**` | `.cursor/skills/backend/backend-db/SKILL.md` (**schema SSOT**) |
| [`api.mdc`](api.mdc) | `backend/src/api/**` | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| [`utils.mdc`](utils.mdc) | `backend/src/utils/**` | `.cursor/skills/backend/backend-utils/SKILL.md` |
| [`mcp.mdc`](mcp.mdc) | `backend/src/mcp/**` | `.cursor/skills/backend/backend-mcp/SKILL.md` |
