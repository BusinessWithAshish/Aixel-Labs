---
name: frontend-mutations-server-actions-map
description: Export and consumer map for frontend/app/actions (progressive disclosure for frontend-mutations-server-actions skill).
---

# Action export map

Consumers are the primary call sites; search the repo before assuming exclusivity.

## `auth-actions.ts`

| Export | Purpose | Typical consumers |
|--------|---------|-------------------|
| `createSession` | Exchange Firebase idToken → session cookie | `(public)/_components/LoginForm.tsx` |
| `handleSignOut` | Revoke cookie + clear session | `components/layout/nav-user.tsx` |

Returns `CreateSessionActionResult` / `void` — not `ALApiResponse`.

## `theme-actions.ts`

| Export | Purpose | Typical consumers |
|--------|---------|-------------------|
| `setThemeColorAction` | Set theme cookie + revalidate layout | `hooks/use-theme-color.ts` |
| `clearThemeColorAction` | Clear theme cookie | same |

## `credit-db.ts` (server-only module)

| Export | Purpose | Called from |
|--------|---------|-------------|
| `getUserCreditsState` | `{ credits, exempt }` (`exempt` ⇔ `isAdmin`) | `user-actions`, `user-lead-actions`, `lead-dashboard-actions` |
| `getUserCredits` | Balance only | internal / debit fallback |
| `assertAndDebitCredits` | Atomic `$inc` when non-admin and balance ≥ cost | `user-lead-actions.createUserLeads` |

## `tenant-actions.ts`

| Export | Auth | Notes |
|--------|------|-------|
| `getAllTenants` | Admin | Cross-tenant list |
| `getTenantByNamePublic` | Public | Middleware / `app/api/tenant` / `validate-tenant` — no firebase imports |
| `getTenantByName` | Admin | Manage-tenants detail |
| `createTenant` | Admin | Normal tenants require `defaultModuleAccess` + `defaultCredits` |
| `updateTenant` | Session tenant | Does **not** update defaults or allow foreign tenant |
| `getTenantDeletePreview` | Session tenant | `{ userCount }` |
| `deleteTenant` | Session tenant | Cascades users + lead memberships; keeps shared leads |

## `user-actions.ts`

| Export | Scope | Notes |
|--------|-------|-------|
| `getAllUsersByTenant` | Admin session tenant | Arg is tenant **name/slug**, not Mongo id |
| `updateUser` | Admin session tenant | Promote admin → `moduleAccess: {}`; demote → tenant defaults |
| `deleteUser` | Admin session tenant | Cascades owned lead data + orphaned Firebase |
| `bulkUpdateUsersModuleAccess` | Admin session tenant | Skips admins (`isAdmin: { $ne: true }`) |
| `updateCurrentUserName` | Self | `parseUserName` |
| `getCurrentUserCredits` | Self | Wraps `getUserCreditsState` |

## `coupon-actions.ts`

| Export | Scope | Notes |
|--------|-------|-------|
| `listCoupons` / `createCoupon` / `updateCoupon` | Admin session tenant | Codes normalized uppercase; unique per tenant |
| `redeemCoupon` | Non-admin user | Atomic capacity reserve + unique redemption; rolls back on failure |

## `user-lead-lists-actions.ts`

| Export | Notes |
|--------|-------|
| `getUserLeadLists` | Includes derived `leadCount` + distinct `sources` |
| `getUserLeadListById` | Owner-scoped |
| `createUserLeadList` | Name required |
| `updateUserLeadListById` | Patch `name` / `description` |
| `deleteUserLeadListById` | Deletes list + memberships for that list |

## `user-lead-actions.ts`

| Export | Notes |
|--------|-------|
| `createUserLeads` | Debit + upsert shared leads + memberships; requires `listName`; returns `CreateUserLeadsResult` |
| `getUserLeadsForList` | Owner list → joined `Lead[]` |
| `deleteUserLeads` | Removes memberships in one list only |
| `createUserLeadListFromLeadIds` | Copies owned leads into a new list |

Scrape is **not** here — `POST /api/lead-gen/scrape` then this save path.

## `lead-dashboard-actions.ts`

| Export | Notes |
|--------|-------|
| `getLeadGenerationDashboardStats` | Totals, 14-day trend, by-source, recent lists, credits (null if exempt) |

Consumed by protected home `app/(protected)/page.tsx`. Stats shape types live in `app/(protected)/_constants`.
