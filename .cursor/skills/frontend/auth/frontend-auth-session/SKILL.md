---
name: frontend-auth-session
description: >-
  Build or change Firebase↔Mongo auth, session cookies, membership, device
  fingerprint, and admin/tenant guards in Aixel Labs. Use when editing
  frontend/lib/auth/, frontend/server/auth/, auth-actions, LoginForm session
  create, or membership/device uniqueness policy.
---

# Frontend auth

Executor for identity + membership. Policy detail SSOT also lives in
`frontend/lib/auth/README.md` — keep that README and this skill aligned when
changing rules.

Governor: `.cursor/rules/frontend/auth.mdc`.

## Layer split (do not blur)

| Path | Role | May touch |
|------|------|-----------|
| `lib/auth/` | Client-safe: constants, types, Thumbmark helper, Firebase error copy, cookie option builders | Browser / shared types |
| `lib/firebase/client.ts` | Firebase **client** SDK | Browser only |
| `lib/firebase/admin.ts` | Firebase **Admin** SDK (`server-only`) | Server only |
| `server/auth/` | Policy, membership Mongo, session read/create, admin guards | `import 'server-only'` |
| `app/actions/auth-actions.ts` | Thin cookie/session entrypoints | Calls `@/server/auth` |

- **No Mongo / Admin writes in `lib/auth/`.**
- **No firebase-admin imports from public/middleware-safe actions** — use `runPublicAction` paths that stay free of `@/server/auth` at module top level (see `frontend-mutations-server-actions`).

## Mental model

| Layer | Stores | Scope |
|-------|--------|-------|
| Firebase Auth | Identity (Google email) | Global — one Google account |
| Mongo `users` | Membership + `deviceFingerprint` | Per tenant |

- Normal user: at most one membership (`UserDoc`) per `firebaseUid`.
- Admin: many memberships allowed (same uid, different tenants), each `isAdmin: true`.
- Admin is never auto-granted on first signup.
- `isAdmin === true` ⇒ credits-exempt and full module access via `getDefaultModuleAccess()` (stored `moduleAccess` stays `{}`).

## Login / session flow

```
LoginForm (Google → deviceFingerprint)
  → createSession(idToken, deviceFingerprint)   # auth-actions
  → verifyIdToken
  → getOrCreateMembership                       # policy + unique fingerprint
  → createSessionCookie + set cookie
  → getAppSession                               # cookie → membership for THIS host only
```

Session never falls back to another tenant’s membership.

## Building / changing auth

### Policy or membership rules

1. Encode pure allow/deny in `server/auth/policy.ts`.
2. Persist path in `server/auth/membership/get-or-create.ts`.
3. Update `AUTH_ERRORS` + messages in `lib/auth/constants.ts`.
4. Update `lib/auth/README.md` login matrix if behavior changes.
5. Keep unique indexes: `(firebaseUid, tenantId)`, `(email, tenantId)`, `(deviceFingerprint, tenantId)`.

### New admin-guarded mutation

1. Prefer `assertCallerIsAdmin()` from `@/server/auth`. Resolve a tenant slug with `getTenantObjectIdByName` when the action is tenant-scoped.
2. Wire through `*-actions.ts` with `runAuthenticatedAction` (server-actions skill).
3. Target the tenant/user/coupon in the request — do not gate on the session host.

### Client auth UX

1. Fingerprint: `lib/auth/device-fingerprint.ts` (skip only when `NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT` + development).
2. Map Firebase codes via `lib/auth/firebase-errors.ts`; app auth codes via `AUTH_ERRORS`.

## Cascade / hard delete

- User: membership + that user’s `user_leads` + `lead_lists`; Firebase Auth when no memberships remain (`server/auth/firebase-cleanup.ts` + `server/leads/cascade-delete.ts`).
- Shared `leads` collection docs are **not** deleted (multi-tenant dedup).

## Related skills (no contradiction)

| Concern | Owner skill |
|---------|-------------|
| **DB schema SSOT** (`UserDoc`, modules) | `backend-db` (`.cursor/skills/backend/backend-db/SKILL.md`) |
| Action envelopes / `runAuthenticatedAction` | `frontend-mutations-server-actions` |
| Manage Tenants UI + session-tenant CRUD | `frontend-business-tenants` |
| Credits exempt UI | `frontend-business-lead-generation` + `frontend/AGENTS.md` |
| Module access SSOT helper | `helpers/module-access-helpers.ts` (edit under manage-tenants / auth flows) |
