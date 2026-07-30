---
name: frontend-code-config
description: >-
  Register routes, submodule URLs, sidebar icons, and tenant middleware constants
  in Aixel Labs frontend config. Use when adding a SubModule path, ADMIN_ONLY_PATHS,
  ALWAYS_ALLOWED_PATHS, LEAD_GEN_SCRAPE_API_ROUTE, or changing middleware subdomain
  rewrites that read app-config.
---

# Frontend config & tenant routing

Executor for `frontend/config/` and `frontend/middleware.ts`.

Governor: `.cursor/rules/frontend/code/surfaces.mdc`.

## Files

| File | Role |
|------|------|
| `config/app-config.ts` | App name, `SubModuleUrls`, route constants, `LEAD_GEN_SCRAPE_API_ROUTE`, tenant prefixes, `ALWAYS_ALLOWED_PATHS` |
| `config/sidebar.config.ts` | `ADMIN_ONLY_PATHS`, module/submodule Lucide icon maps, sidebar types |
| `middleware.ts` | Subdomain → tenant fetch → rewrite/redirect by `TenantType`; skips `/api` |

Path ACL for modules is built in `helpers/sidebar-config-helpers.ts` from `SubModuleUrls` + `getDefaultModuleAccess()` — do not fork a second URL map.

## New submodule route checklist

When a backend `LEAD_GENERATION_SUB_MODULES` (or other `SubModule`) gains a product page
(enums live in `backend/src/db/types.ts` — `.cursor/skills/backend/backend-db/SKILL.md`):

1. Add page under `app/(protected)/…` (feature skill owns the UI).
2. `SubModuleUrls[SUBMODULE] = '/…'` in `app-config.ts`.
3. `subModuleIconMap[SUBMODULE]` in `sidebar.config.ts`.
4. If billed lead-gen: credits + `lead-gen-api` (lead-gen skill).
5. Optional home tile: `DASHBOARD_SOURCE_META` in `app/(protected)/_constants.ts`.
6. Do **not** add the path to `ALWAYS_ALLOWED_PATHS` unless every signed-in user may open it without module grant.
7. Admin-only surfaces (not module-gated): add to `ADMIN_ONLY_PATHS`.

## Middleware rules (when changing)

- `/api/*` is excluded (matcher + early return) — never require tenant rewrite for API.
- Tenant lookup uses public `GET /api/tenant?name=` (`getTenantByNamePublic`) — must stay firebase-free.
- Sets `PATHNAME_HEADER_KEY` (`x-pathname`) for `withRouteGuard` / ACL.
- `TenantType`: `EXTERNAL` redirect, `IFRAME` lock to home + rewrite, `PRODUCT` rewrite under `PRODUCT_TENANTS_ROUTE_PREFIX`, default pass-through.
- Use constants from `app-config` — do not hardcode `/api`, `/iframe`, `/products`, `/not-found`.

## Related skills

- Lead-gen page registration extras → `frontend-business-lead-generation`
- Manage tenants route constants → `frontend-business-tenants`
- Auth session / public tenant action → `frontend-auth-session` / `frontend-mutations-server-actions`
- API route shape → `frontend-code-api-routes`
