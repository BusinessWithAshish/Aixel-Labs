---
name: frontend-business-tenants
description: >-
  Build or change the admin Manage Tenants UI and its server actions in Aixel
  Labs (tenant CRUD, users, module access, coupons, subdomain switch). Use when
  editing frontend/app/(protected)/manage-tenants/, tenant-actions,
  user-actions admin paths, coupon-actions from that route, ModuleAccessCard,
  or ADMIN_ONLY_PATHS / manage-tenants routing.
---

# Manage Tenants

Admin-only multi-tenant console under `frontend/app/(protected)/manage-tenants/`.

## Routes

| Path | Page | Purpose |
|------|------|---------|
| `/manage-tenants` | `page.tsx` | List/search tenants; create/edit/delete; switch host |
| `/manage-tenants/[tenantId]` | `[tenantId]/page.tsx` | Users + coupons for one tenant (`tenantId` = tenant **name/slug**) |

Constants: `MANAGE_TENANTS_ROUTE`, `MANAGE_TENANTS_PREFIX` in `frontend/config/app-config.ts`. Listed in `ADMIN_ONLY_PATHS` (`sidebar.config.ts`). Entry: tenant-switcher → `/manage-tenants`.

## Page shell (do not invent another pattern)

```
async page
  → getAppSession + server actions for initial data
  → PageProvider({ data, usePageHook })
  → PageLayout + *_Content
export default withAdminOnly(withPageHandler(Page))
```

- Colocate UI in `_components/`, page state in `_hooks/use-*-page.ts`.
- Client content reads state via `usePage<Use*PageReturn>()`.
- After mutations: `toast` + `router.refresh()` (server-fetched data, not local optimistic lists).

## Folder map

```
manage-tenants/
├── page.tsx                          # list
├── _hooks/use-manage-tenants-page.ts
├── _components/
│   ├── ManageTenantsContent.tsx
│   ├── TenantCard / CreateTenantCard
│   ├── CreateTenantDialog.tsx        # create + edit
│   ├── ModuleAccessCard.tsx          # shared module toggles
│   └── DeleteConfirmDialog.tsx
└── [tenantId]/
    ├── page.tsx                      # users + coupons
    ├── _hooks/use-tenant-users-page.ts
    └── _components/
        ├── TenantUsersContent.tsx
        ├── UserCard / EditUserDialog / ResetUserFormDialog
        ├── UserBulkActionsToolbar / BulkModuleAccessDialog
        ├── DeleteUserConfirmDialog
        └── CouponsSection / CreateCouponDialog
```

## Hard product rules

### 1. Admin cross-tenant access

Admins can list, edit, and delete any tenant, and manage that tenant's users/coupons, without switching host.

- Guards: `assertCallerIsAdmin`. Resolve the target tenant by slug with `getTenantObjectIdByName` (or by `_id` on tenant update/delete).
- UI: edit/delete/open users in place. Do not add a subdomain-switch dialog for manage-tenants.
- `[tenantId]` always fetches that tenant's users/coupons (`listCoupons(tenantId)`, `getAllUsersByTenant(tenantId)`).

Create is admin-wide. Update/delete/user/coupon mutations are admin-wide, targeted by the tenant/user/coupon in the request.

### 2. Tenant types

| Kind | `type` | Defaults on create |
|------|--------|--------------------|
| Normal | omitted / cleared | **Required** `defaultModuleAccess` + `defaultCredits` |
| Special | `IFRAME` \| `PRODUCT` \| `EXTERNAL` | No defaults; often `redirect_url` |

- Options: `TENANT_TYPE_OPTIONS` in `app-config.ts`; enum `TenantType` from `@aixellabs/backend/db/types`.
- Tenants with `redirect_url`: card click disabled (`dontAllowClick`).
- **Name is immutable after create** (form disables name when editing).
- **`defaultModuleAccess` / `defaultCredits` are create-only** — `updateTenant` must not `$set` them.

### 3. Module access & admins

- Toggle UI: `ModuleAccessCard` + helpers in `frontend/helpers/module-access-helpers.ts`.
- Full-grant SSOT: `getDefaultModuleAccess()` (sidebar ACL, bulk “select all”, demotion fallback).
- **Admins store `moduleAccess: {}`**. Runtime access uses `getDefaultModuleAccess()`, not the Mongo map.
- Promote to admin → clear `moduleAccess` to `{}`.
- Demote admin → set `moduleAccess` from tenant `defaultModuleAccess` (or `{}`).
- Bulk module update (`bulkUpdateUsersModuleAccess`) **skips admins** (`isAdmin: { $ne: true }`). Selection UI must not select admins.
- `isAdmin === true` ⇒ credits-exempt product rule still applies (see frontend `AGENTS.md`).

### 4. Users are not created here

Users appear after Google sign-in + phone verify. This UI only edit / delete / bulk module access / credits.

### 5. Deletes cascade carefully

- **User delete**: user-owned lead data + user doc; Firebase only if orphaned (`deleteOrphanedFirebaseUsers`).
- **Tenant delete**: preview user count → delete users’ lead data → users → tenant → orphaned Firebase. Shared `leads` docs kept.

## Server actions map

| Concern | File | Key exports |
|---------|------|-------------|
| Tenants | `app/actions/tenant-actions.ts` | `getAllTenants`, `getTenantByName`, `createTenant`, `updateTenant`, `getTenantDeletePreview`, `deleteTenant` |
| Users | `app/actions/user-actions.ts` | `getAllUsersByTenant` (slug = name), `updateUser`, `deleteUser`, `bulkUpdateUsersModuleAccess` |
| Coupons | `app/actions/coupon-actions.ts` | `listCoupons`, `createCoupon`, `updateCoupon` (tenant detail section) |

- Wrap with `runAuthenticatedAction`; return `ALApiResponse<T>`.
- Map Mongo → client with `mapMongoDocToClient` / `mapUserDocToUser`.
- Credits: `parseCreditsInput` / `normalizeCredits` / `MAX_USER_CREDITS` — never invent a second credits clamp.

`getTenantByNamePublic` is middleware/subdomain only — not for this UI.

## Types

Import from `@aixellabs/backend/db/types` — **schema SSOT** is `backend/src/db`
(`.cursor/skills/backend/backend-db/SKILL.md`). Do not duplicate:

- `Tenant` / `TenantDoc`, `TenantType`
- `User` / `UserDoc`, `ModuleAccess`, `Modules`, submodule enums
- `Coupon`

`[tenantId]` param and `getAllUsersByTenant(tenantId)` use tenant **name** (slug), not Mongo `_id`.

## Change checklists

**New tenant field**

1. Add to `TenantDoc` in `backend/src/db/types.ts` (schema SSOT — `backend-db` skill).
2. Wire `createTenant` / `updateTenant` (respect create-only vs editable).
3. Form field in `CreateTenantDialog` + card display if needed.
4. Keep normal vs typed-tenant branching.

**New module / submodule**

1. Enum + `ModuleAccess` in backend `db/types.ts` (`backend-db` skill).
2. Update `getDefaultModuleAccess` / `getSubModulesForModule` and sidebar config.
3. `ModuleAccessCard` picks up via `Object.values(Modules)` — verify labels/icons.

**User edit / bulk / coupons**

1. Prefer extending existing dialogs/toolbars over new pages.
2. Keep self-demotion: warn via confirm when `currentUserId === user._id` and clearing `isAdmin`.

## Anti-patterns

- DO NOT allow editing `defaultModuleAccess` / `defaultCredits` / tenant `name` after create.
- DO NOT store full module maps on admin users.
- DO NOT select admins in bulk module access.
- DO NOT bypass `withAdminOnly` or admin guards on new actions used here.

## Related

- Governor: `.cursor/rules/frontend/business/tenants.mdc`
- **DB schema SSOT:** `.cursor/skills/backend/backend-db/SKILL.md`
- Actions / debit: `.cursor/skills/frontend/mutations/frontend-mutations-server-actions/SKILL.md`
- Auth / admin guards: `.cursor/skills/frontend/auth/frontend-auth-session/SKILL.md`
- Page shell: `.cursor/skills/frontend/code/frontend-code-page-shell/SKILL.md`
- Skill ↔ governor map: `frontend/AGENTS.md` → “Skills (executors) and rules (governors)”
