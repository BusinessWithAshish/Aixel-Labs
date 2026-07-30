---
name: backend-db
description: >-
  SSOT for Mongo collections, Doc types, modules/submodules, LeadData/LeadSource,
  and the shared Mongo client under backend/src/db. Use when adding or refactoring
  any persisted feature (leads, users, tenants, credits, coupons, module access),
  extending LeadData, or changing collection schemas. Frontend and backend/api
  skills consume this — do not invent parallel FE/BE type definitions.
---

# Backend DB schema SSOT (`backend/src/db`)

**This folder is the single source of truth** for database shape: collection
names, document types, module/submodule enums, lead payload unions, and the
shared Mongo client. New features and refactors that persist data **start here**,
then wire FE actions / indexes / UI and (for leads) API response types.

## Layout

| File | Role |
|------|------|
| `types.ts` | Enums + Doc types + `LeadData` / client `string`-id aliases |
| `mongo-client.ts` | Singleton client, `getDatabase`, `getCollection`, `checkConnection` |
| `index.ts` | Barrel: types + `MongoObjectId` + ObjectId-bound Doc aliases + client helpers |

Package exports (`@aixellabs/backend`):

| Import | Use when |
|--------|----------|
| `@aixellabs/backend/db/types` | Client / shared types & enums (preferred in UI) |
| `@aixellabs/backend/db` | Server: `getCollection`, `MongoCollections`, ObjectId `*Doc` aliases |
| `@aixellabs/backend/db/mongo-client` | Rare; prefer barrel |

## Architecture boundaries

```
backend/src/api/**     → scrape JSON only (no getCollection)
backend/src/db/**      → schema SSOT + client helpers (this skill)
frontend server/actions → all Mongo I/O via getCollection
frontend indexes       → ensure* under server/auth|leads|coupons (not in db/)
```

Scrapers never write Mongo. Persistence is frontend-owned; shapes are backend-owned.

## Collections (`MongoCollections`)

| Enum | Collection | Typical Doc |
|------|------------|-------------|
| `TENANTS` | `tenants` | `TenantDoc` |
| `USERS` | `users` | `UserDoc` (membership + `credits`) |
| `LEADS` | `leads` | `LeadDoc` — shared dedup by `(source, sourceId)` |
| `USER_LEADS` | `user_leads` | `UserLeadDoc` — per-user membership |
| `LEAD_LISTS` | `lead_lists` | `UserLeadListDoc` |
| `COUPONS` | `coupons` | `CouponDoc` |
| `COUPON_REDEMPTIONS` | `coupon_redemptions` | `CouponRedemptionDoc` |

Always use `MongoCollections.*` — never raw collection name strings in new code.

## Doc vs client types

- Server Mongo: `*Doc` with `ObjectId` (from `@aixellabs/backend/db` aliases).
- Client / API JSON: `Tenant`, `User`, `Lead`, `Coupon`, … (`*Doc<string>` or ISO-date DTOs).
- Map with `mapMongoDocToClient` / domain mappers — do not return raw `ObjectId` to the client.

## Modules & access

- `Modules`, `*_SUB_MODULES`, `SubModule`, `ModuleAccess` live **only** in `types.ts`.
- Full-access runtime grant for admins: FE `getDefaultModuleAccess()` — admins store `moduleAccess: {}`.
- Tenant defaults: `TenantDoc.defaultModuleAccess` / `defaultCredits` (create-time).

## Leads contract

```
API item.id  →  LeadDoc.sourceId
API item     →  LeadDoc.data (LeadData)
LeadSource   →  LeadDoc.source  (via getLeadSoruceFromSubModule on FE)
```

- `LeadData` = union of product API response types (gmaps, gsearch, ig, fb, linkedin, …).
- New lead product: extend API response type **and** `LeadData` + `LeadSource` +
  `LEAD_GENERATION_SUB_MODULES` here, then FE checklist
  (`frontend-business-lead-generation`).
- Shared `leads` docs are **never** cascade-deleted; only `user_leads` / `lead_lists`.

Credits are a field on `UserDoc` (`credits?`) — not a separate collection.

## Change checklists

### New / changed document field

1. Edit the `*Doc` in `backend/src/db/types.ts`.
2. Update writers/readers (FE actions under `app/actions/`, `server/auth`, etc.).
3. Add/adjust indexes in the owning FE `indexes.ts` if query patterns change.
4. Update UI forms/cards only after the type exists in `types.ts`.

### New collection

1. Add `MongoCollections` value + `*Doc` / client alias in `types.ts`.
2. Export ObjectId alias from `index.ts` if needed.
3. FE: actions + `ensure*Indexes` + UI.
4. Document cascade rules (what deletes with user/tenant).

### New lead product / submodule

1. API response type with stable `id` (`backend-api-module`).
2. Here: `LEAD_GENERATION_SUB_MODULES`, `LeadSource`, `LeadData` union.
3. FE: lead-gen skill checklist (URLs, credits, `lead-gen-api`, page, card).

### New product module (non-lead)

1. `Modules` + submodule enum + `ModuleAccess` key in `types.ts`.
2. FE: `getDefaultModuleAccess` / sidebar / manage-tenants picks.

## Do / don’t

- DO treat `types.ts` as schema SSOT for features and refactors.
- DO import from `@aixellabs/backend/db` / `db/types` — never copy Doc shapes into FE.
- DO keep `backend/src/api` free of Mongo.
- DON’T add parallel `interface User` / lead payload types on the frontend.
- DON’T put ensure-index logic inside `backend/src/db` — indexes stay next to FE writers.
- DON’T invent collection names outside `MongoCollections`.

## Related

| Concern | Path |
|---------|------|
| Governor | `.cursor/rules/backend/db.mdc` |
| Scraper APIs | `.cursor/skills/backend/backend-api-module/SKILL.md` |
| FE Mongo I/O | `.cursor/skills/frontend/mutations/frontend-mutations-server-actions/SKILL.md` |
| Lead product | `.cursor/skills/frontend/business/frontend-business-lead-generation/SKILL.md` |
| Tenants / modules UI | `.cursor/skills/frontend/business/frontend-business-tenants/SKILL.md` |
| Auth membership | `.cursor/skills/frontend/auth/frontend-auth-session/SKILL.md` |
