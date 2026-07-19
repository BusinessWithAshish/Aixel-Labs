# Auth: Firebase ↔ Mongo

SSOT for humans and AI agents. Policies are enforced in `frontend/server/auth/policy.ts` and admin/tenant scope in `frontend/server/auth/admin-guards.ts`.

## Mental model

| Layer | Stores | Scope |
| --- | --- | --- |
| **Firebase Auth** | Identity (Google email) | Global — one Google account |
| **Mongo `users`** | Membership (access to one org) + `deviceFingerprint` | Per tenant |

**Identity rule:** one Google email ↔ one Firebase UID. Device uniqueness is app-side: one `deviceFingerprint` per tenant (ThumbmarkJS OSS `thumbmark` for now; Free API `visitorId` later).

**Membership rules:**

| Role | Rule |
| --- | --- |
| Normal user | At most one `UserDoc` per `firebaseUid` (one tenant only) |
| Admin | Many `UserDoc`s allowed (same `firebaseUid`, different tenants), each `isAdmin: true` |

Admin is granted only via Mongo/console or another admin — never auto on first signup.

## Admin powers (current host membership)

When `isAdmin` on the **session tenant**:

- Full module access for sidebar/routes via `getDefaultModuleAccess()` (SSOT) — stored `moduleAccess` is ignored and kept as `{}`
- Credits exempt (no credits field when editing an admin user)
- `/manage-tenants` + tenant switcher
- Sensitive user/tenant reads and mutations (**scoped to that session tenant only**)

**Tenant-scoped mutations:** an admin signed into tenant A cannot update/delete users or the tenant document for tenant B. Switch host (subdomain) first. Listing all tenants for navigation (`getAllTenants`) remains allowed for admins.

**Demotion on A only:** set `isAdmin: false` and `moduleAccess = tenant.defaultModuleAccess` on A; leave other memberships unchanged (may stay admin on B). Same Firebase UID — no extra accounts.

**Bulk module update:** skips admins (UI + server).

## Ownership

| Path | Role |
| --- | --- |
| `lib/auth/` | Client-safe helpers: constants, types, Thumbmark fingerprint helper, Firebase error copy, cookie option builders. **No Mongo / Admin writes.** |
| `server/auth/` | Policy, Firebase Admin, Mongo membership, session read, create-session orchestration, admin/tenant guards |
| `app/actions/auth-actions.ts` / `api/auth/session` | Thin entrypoints (cookies, redirect) |
| `app/actions/user-actions.ts` / `tenant-actions.ts` | Admin-gated, session-tenant-scoped CRUD |

## Login flow

```text
LoginForm (Google → Thumbmark deviceFingerprint)
  → createSession(idToken, deviceFingerprint)  # auth-actions
  → verifyIdToken                               # email required
  → getOrCreateMembership                       # policy + Mongo unique fingerprint
  → createSessionCookie + set cookie
  → getAppSession                               # cookie → membership for THIS host only
```

Same browser profile + second Google account on the same tenant → `DEVICE_IN_USE_ON_TENANT`. Different browsers often get different fingerprints (OSS limitation).

**Local development:** set `NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT=true` in `.env.local`. Thumbmark is not called; uniqueness is not enforced (`NODE_ENV === 'development'` required). Do not rely on this in production.

## Membership decision (create-session)

```text
Find membership (uid, thisTenant)
  → found → update profile (fingerprint stays sticky from signup)
  → missing → if fingerprint already used by another uid on tenant → DEVICE_IN_USE_ON_TENANT
       → else list memberships for uid
       → none → create (isAdmin: false, moduleAccess: tenant.defaultModuleAccess, deviceFingerprint)
       → any isAdmin → create (isAdmin: true, moduleAccess: {}, deviceFingerprint)
       → only non-admin elsewhere → deny WRONG_TENANT
```

Session never falls back to another tenant’s membership. New tenant host requires sign-in once.

## Hard delete

- **User:** membership + that user’s `user_leads` + `lead_lists`; Firebase Auth when no memberships remain.
- **Tenant:** cascade users + lead lists/links; Firebase Auth for UIDs with no remaining memberships.

## Indexes

- Unique `(firebaseUid, tenantId)`
- Unique `(email, tenantId)`
- Unique `(deviceFingerprint, tenantId)`

## Login matrix

### Success

| # | Scenario | Outcome |
| --- | --- | --- |
| S1 | New identity, new tenant | Create non-admin membership + store fingerprint |
| S2 | Same uid, same tenant | Update profile (fingerprint unchanged) |
| S3 | Admin uid, new tenant | Create admin membership + fingerprint |
| S4 | Non-admin uid, other tenant | Deny |

### Server / Mongo (`AUTH_ERRORS`)

| Key | When |
| --- | --- |
| `WRONG_TENANT` | Non-admin already belongs to another org |
| `DEVICE_IN_USE_ON_TENANT` | Another account already signed up from this device on this tenant |
| `EMAIL_IN_USE_ON_TENANT` | Mongo unique email conflict on this tenant |
| `EMAIL_REQUIRED` / `MISSING_DEVICE_FINGERPRINT` | Missing Google email or fingerprint |
| `TENANT_NOT_FOUND` | Unknown host subdomain |
| `AUTH_FAILED` | Token/session failure |

**Agent rule:** Same device + different Google account on signup → `DEVICE_IN_USE_ON_TENANT`, not a Firebase phone error.

## Code map

| File | Role |
| --- | --- |
| `lib/auth/constants.ts` | Cookie TTL, `AUTH_ERRORS`, toasts |
| `lib/auth/firebase-errors.ts` | Firebase code → user message |
| `lib/auth/device-fingerprint.ts` | ThumbmarkJS OSS `thumbmark` helper |
| `server/auth/policy.ts` | Pure allow/deny |
| `server/auth/admin-guards.ts` | Admin + session-tenant scope helpers |
| `server/auth/membership/get-or-create.ts` | Mongo path |
| `server/auth/create-session.ts` | Orchestration |
| `server/auth/session/get-app-session.ts` | Cookie → `AppSession` |
