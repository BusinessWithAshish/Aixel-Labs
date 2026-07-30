# Backend skills

Aixel **backend** executors (how to build APIs, services, wiring).

Third-party scraper/deploy docs stay under [`../external/`](../external/)
(`botasaurus`, `gcloud-run-functions`). Cross-cutting DRY lives in
[`../common/dry-module-cleanup`](../common/dry-module-cleanup/).

| Skill `name` | Folder | Governed by |
|--------------|--------|-------------|
| `backend-platform` | [`backend-platform/`](backend-platform/) | `.cursor/rules/backend/platform.mdc` |
| `backend-db` | [`backend-db/`](backend-db/) | `.cursor/rules/backend/db.mdc` |
| `backend-api-module` | [`backend-api-module/`](backend-api-module/) | `.cursor/rules/backend/api.mdc` |
| `backend-utils` | [`backend-utils/`](backend-utils/) | `.cursor/rules/backend/utils.mdc` |
| `backend-mcp` | [`backend-mcp/`](backend-mcp/) | `.cursor/rules/backend/mcp.mdc` |

- **`backend-platform/`** — `config.ts` / `routes.ts` / `server.ts` (mounts + boot). **Read for any mount/server change.**
- **`backend-db/`** — monorepo **schema SSOT** (collections, Doc types, `LeadData`, modules).
- **`backend-api-module/`** — Express scraper pattern (not 1:1 with every product folder).
- **`backend-utils/`** — TLS/proxy/location shared by scrapers (BE-only, not FE).
- **`backend-mcp/`** — Streamable HTTP MCP tools → intelligence services.
