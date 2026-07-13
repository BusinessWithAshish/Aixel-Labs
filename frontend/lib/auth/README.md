# Auth: Firebase ↔ Mongo

SSOT for humans and AI agents. Policies are enforced in `frontend/server/auth/policy.ts`.

## Mental model

| Layer | Stores | Scope |
| --- | --- | --- |
| **Firebase Auth** | Identity (Google email + phone) | Global — one person |
| **Mongo `users`** | Membership (access to one org) | Per tenant |

**Identity rule:** one Google email ↔ one Firebase UID ↔ one phone (**1:1:1**). Enforced by Firebase.

**Membership rules:**

| Role | Rule |
| --- | --- |
| Normal user | At most one `UserDoc` per `firebaseUid` (one tenant only) |
| Admin | Many `UserDoc`s allowed (same `firebaseUid`, different tenants), each `isAdmin: true` |

Admin is granted only via Mongo/console or another admin — never auto on first signup.

## Ownership

| Path | Role |
| --- | --- |
| `frontend/lib/auth/` | Client-safe helpers: constants, types, schema, Firebase error copy, cookie option builders. **No Mongo / Admin writes.** |
| `frontend/server/auth/` | Policy, Firebase Admin, Mongo membership, session read, create-session orchestration |
| `app/actions/auth-actions.ts` / `app/api/auth/session` | Thin entrypoints (cookies, redirect) |

## Login flow

```text
LoginForm (Google → phone if needed)
  → createSession(idToken)          # auth-actions
  → verifyIdToken                   # server/auth/identity
  → getOrCreateMembership           # policy + Mongo
  → createSessionCookie + set cookie
  → getAppSession                   # cookie → membership for THIS host only
```

## Membership decision (create-session)

```text
Find membership (uid, thisTenant)
  → found → update profile
  → missing → list memberships for uid
       → none → create (isAdmin: false)
       → any isAdmin → create (isAdmin: true)
       → only non-admin elsewhere → deny WRONG_TENANT
```

Session never falls back to another tenant’s membership. New tenant host requires sign-in once (phone already linked → skip OTP).

## Indexes

- Unique `(firebaseUid, tenantId)`
- Unique `(email, tenantId)`
- Unique `(phoneNumber, tenantId)`

## Login matrix

### Success

| # | Scenario | Outcome |
| --- | --- | --- |
| S1 | New identity, new tenant | Create non-admin membership |
| S2 | Same uid, same tenant | Update profile |
| S3 | Admin uid, new tenant | Create admin membership |
| S4 | Non-admin uid, other tenant | Deny |

### Firebase (client — before Mongo)

| Code | Meaning |
| --- | --- |
| `auth/account-exists-with-different-credential` | Phone/email already on another Google account |
| `auth/credential-already-in-use` | Phone already on another UID |
| `auth/invalid-verification-code` | Bad OTP |
| `auth/code-expired` | OTP expired |
| See `firebase-errors.ts` for full map |

### Server / Mongo (`AUTH_ERRORS`)

| Key | When |
| --- | --- |
| `WRONG_TENANT` | Non-admin already belongs to another org |
| `PHONE_IN_USE_ON_TENANT` / `EMAIL_IN_USE_ON_TENANT` | Mongo unique conflict on this tenant |
| `PHONE_REQUIRED` / `EMAIL_REQUIRED` | Token missing claims |
| `TENANT_NOT_FOUND` | Unknown host subdomain |
| `AUTH_FAILED` | Token/session failure |

**Agent rule:** Same phone + different Google email → Firebase error, not Mongo.

## Code map

| File | Role |
| --- | --- |
| `lib/auth/constants.ts` | Cookie TTL, `AUTH_ERRORS`, toasts |
| `lib/auth/firebase-errors.ts` | Firebase code → user message |
| `lib/auth/login-schema.ts` | Zod phone/OTP |
| `server/auth/policy.ts` | Pure allow/deny |
| `server/auth/membership/get-or-create.ts` | Mongo path |
| `server/auth/create-session.ts` | Orchestration |
| `server/auth/session/get-app-session.ts` | Cookie → `AppSession` |
