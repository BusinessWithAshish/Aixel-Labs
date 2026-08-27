---
name: frontend-mutations-server-actions
description: >-
  Create or change Next.js server actions under frontend/app/actions/ in Aixel
  Labs (auth, theme, tenants, users, coupons, credits, lead lists, leads,
  dashboard). Use when editing *-actions.ts or credit-db.ts, adding a mutation
  that returns ALApiResponse, wiring runAuthenticatedAction / runPublicAction,
  debiting credits, or cascading deletes for users/tenants/lists.
---

# Frontend server actions

Canonical patterns for `frontend/app/actions/`. UI-specific flows live in sibling skills (`frontend-business-tenants`, `frontend-business-lead-generation`); this skill owns the **action layer**.

## Folder map

| File | Role | Auth wrapper |
|------|------|--------------|
| `auth-actions.ts` | Session cookie create / sign-out | Custom (cookies + `@/server/auth`) |
| `theme-actions.ts` | Theme color cookie + `revalidatePath` | None (cookie-only, void) |
| `credit-db.ts` | Credits read + atomic debit | **Not** `'use server'` — `import 'server-only'` |
| `tenant-actions.ts` | Tenant CRUD + public lookup by name | `runAuthenticatedAction` / `runPublicAction` |
| `user-actions.ts` | Admin user CRUD/bulk + self name/credits | `runAuthenticatedAction` |
| `coupon-actions.ts` | Admin coupon CRUD + user redeem | `runAuthenticatedAction` |
| `user-lead-lists-actions.ts` | Lead list CRUD + stats | `runAuthenticatedAction` |
| `user-lead-actions.ts` | Save scraped leads, list leads, copy/delete | `runAuthenticatedAction` |
| `lead-dashboard-actions.ts` | Home dashboard aggregates | `runAuthenticatedAction` |

Full export → consumer map: [action-map.md](action-map.md).

## Default action template

Almost every DB-backed action follows this shape:

```ts
'use server';

import { ALApiResponse } from '@aixellabs/backend/api/types';
import { /* Doc types, MongoCollections, getCollection */ } from '@aixellabs/backend/db';
import {
  assertRequiredTrimmedString,
  assertValidObjectId,
  requireUserObjectId,
  runAuthenticatedAction,
  toObjectId,
} from '@/helpers/server-action-helpers';

export const myAction = async (input: string): Promise<ALApiResponse<MyResult>> => {
  // 1. Validate serializable inputs BEFORE the wrapper when cheap (throws → uncaught by client unless wrapper catches)
  assertRequiredTrimmedString(input, 'Input');
  assertValidObjectId(input, 'Input');

  return runAuthenticatedAction(async function myAction(userId) {
    // 2. Prefer named function so errors log as `[critical] myAction`
    const uid = requireUserObjectId(userId);
    // 3. Admin-only? await requireAdminSessionContext() / assertCallerIsAdmin()
    // 4. Query Mongo via getCollection; throw Error('...') on failure
    // 5. Return plain JSON-safe data (string IDs, ISO dates where needed)
    return result;
  });
};
```

### Return contract

- DB / business actions → `Promise<ALApiResponse<T>>` (`{ success, data?, error? }` from `@aixellabs/backend/api/types`).
- `runAuthenticatedAction` / `runPublicAction` catch thrown `Error`s and map to `{ success: false, error: message }`.
- Exceptions: `auth-actions` (`CreateSessionActionResult` / `void`), `theme-actions` (`void`), `credit-db` (throws; callers wrap).

### Helpers (do not reinvent)

| Need | Use |
|------|-----|
| Auth + envelope | `runAuthenticatedAction` |
| No auth (middleware-safe) | `runPublicAction` — **must not** import firebase-admin / session at top level |
| ObjectId checks | `assertValidObjectId`, `toObjectId`, `requireUserObjectId` |
| Required strings | `assertRequiredTrimmedString` |
| Mongo → client `_id` string | `mapMongoDocToClient` (`helpers/normalize-helpers`) |
| Credits clamp/parse | `normalizeCredits` / `parseCreditsInput` (`helpers/credits`) |
| Credits debit / exempt | `assertAndDebitCredits` / `getUserCreditsState` (`credit-db.ts`) |
| Admin session scope | `assertCallerIsAdmin`, `getTenantObjectIdByName`, `requireAdminSessionContext` (`@/server/auth`) |

## Hard product rules

1. **`isAdmin === true` ⇒ credits-exempt.** Never debit admins; never redeem coupons for admins. UI must gate on `creditsExempt` / `exempt`, but enforcement is server-side.
2. **Debit only in `credit-db` / callers of it.** Never `$inc` credits ad hoc except coupon redeem (which has its own atomic path) and admin `updateUser` credit edits.
3. **`credit-db.ts` stays `server-only`**, not `'use server'`. Import it only from other server actions / server code — never from client components.
4. **Admin tenant mutations** target the tenant/user/coupon in the request (`assertCallerIsAdmin` + slug/`_id`). See `frontend-business-tenants` skill.
5. **Shared `leads` docs are never cascade-deleted** with user/tenant/list cleanup — only user-owned memberships (`USER_LEADS` / `LEAD_LISTS`). Use `deleteUserOwnedLeadData` for user/tenant deletes.
6. **Lead save order in `createUserLeads`:** access/credits check → cap by balance → **debit first** → create list → upsert leads/memberships. Debit before list so a failed charge cannot orphan a list.
7. **Types from `@aixellabs/backend/db`** — schema SSOT is `backend/src/db` (`.cursor/skills/backend/backend-db/SKILL.md`). Do not duplicate `UserDoc` / `TenantDoc` / `CouponDoc` / `LeadData` / module enums on the FE; change `types.ts` first when the schema evolves.
8. **Public tenant lookup** (`getTenantByNamePublic`) must stay free of auth imports so middleware/subdomain routing does not pull firebase-admin.

## Auth levels cheat sheet

| Level | Pattern | Examples |
|-------|---------|----------|
| Public | `runPublicAction` | `getTenantByNamePublic` |
| Any signed-in user | `runAuthenticatedAction` + `userId` | lead lists, `updateCurrentUserName`, `redeemCoupon` |
| Admin (any tenant read) | `assertCallerIsAdmin()` | `getAllTenants`, `createTenant` |
| Admin (any tenant) | `assertCallerIsAdmin()` + target by id/slug | `updateTenant`, `deleteUser`, coupons CRUD, bulk module access |
| Cookie / session special | Direct cookies + `@/server/auth` | `createSession`, `handleSignOut` |

## Naming & file rules

- One domain per file: `*-actions.ts`.
- Named exports; prefer `export const foo = async …` or `export async function foo` — match the file you edit.
- Name the inner `runAuthenticatedAction` callback (`async function foo`) for critical logs.
- Put domain mappers next to the actions that use them (`mapUserDocToUser`, `mapCouponDocToCoupon`, …).
- New shared credit logic → extend `credit-db.ts` or `helpers/credits.ts`, not a new parallel debit helper.

## Change checklists

### New authenticated CRUD action

1. Add to the matching `*-actions.ts` (or new `foo-actions.ts` if new domain).
2. Validate inputs → `runAuthenticatedAction` → Mongo → map to client.
3. Return `ALApiResponse<T>`; throw user-facing `Error` messages.
4. Wire consumer (page / hook / component); check `success` before using `data`.
5. If admin/tenant-scoped, add the correct guard from `@/server/auth`.

### New credits-affecting path

1. Cost SSOT: `helpers/credits.ts` (`CREDIT_COST_PER_ITEM` / `getCreditCostPerItem` / `computeLeadGenCreditCost`).
2. Debit via `assertAndDebitCredits` only (or coupon redeem’s atomic path).
3. Return `creditsExempt` / remaining balance when the UI needs it (`CreateUserLeadsResult`, dashboard stats).
4. Never show cost/exhausted UI for exempt users (frontend `AGENTS.md`).

### New lead-related action

1. Prefer extending `user-lead-actions.ts` / `user-lead-lists-actions.ts`.
2. Scope queries with `{ userId: uid }` (and `listId` when list-scoped).
3. Membership is per list — same lead may exist in multiple lists; delete membership ≠ delete shared `leads` doc.
4. After scrape, save only through `createUserLeads` (see frontend-business-lead-generation skill).

### Cascade delete

| Entity | Cascade |
|--------|---------|
| Lead list | Delete list + `USER_LEADS` for that list/user |
| User | `deleteUserOwnedLeadData` → user doc → orphaned Firebase |
| Tenant | Preview count → users’ lead data → users → tenant → orphaned Firebase |

## Anti-patterns

- DO NOT add `'use server'` to `credit-db.ts` or import it from client components.
- DO NOT invent a second credits cost map or debit helper.
- DO NOT return raw Mongo `ObjectId` / `Date` without mapping when the client consumes the payload (prefer string ids; ISO strings for dates on coupon-like DTOs).
- DO NOT put scrape HTTP / Botasaurus calls inside actions — scrape is `POST /api/lead-gen/scrape`; actions only debit + persist.
- DO NOT import `@/server/auth` (firebase) into public actions used by middleware.
- DO NOT delete shared `MongoCollections.LEADS` documents on user/list/tenant cleanup.

## Related skills / rules

- Governor: `.cursor/rules/frontend/mutations.mdc`
- **DB schema SSOT:** `.cursor/skills/backend/backend-db/SKILL.md`
- Auth guards / session: `.cursor/skills/frontend/auth/frontend-auth-session/SKILL.md`
- Tenant/user/coupon **UI**: `.cursor/skills/frontend/business/frontend-business-tenants/SKILL.md`
- Lead-gen **forms / scrape pipeline**: `.cursor/skills/frontend/business/frontend-business-lead-generation/SKILL.md`
- Product credits rules: `frontend/AGENTS.md`
- Skill ↔ governor map: `frontend/AGENTS.md` → “Skills (executors) and rules (governors)”
