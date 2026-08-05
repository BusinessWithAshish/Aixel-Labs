# @aixellabs/frontend

Next.js 15 App Router app (React 19, Tailwind v4, shadcn/ui) for Aixel Labs:
marketing site, multi-tenant product app, credited lead-gen scrapers, messaging,
and voice dialer.

## Commands

```bash
pnpm --filter frontend dev      # http://localhost:3003
pnpm --filter frontend lint
pnpm --filter frontend types
pnpm --filter frontend build
```

Env: copy `.env.example` → `.env` / `.env.local` (Firebase, `BE_API`, booking
webhook, optional `NEXT_PUBLIC_SKIP_DEVICE_FINGERPRINT` for local auth).

## Layout (high level)

| Path                       | Role                                                                       |
| -------------------------- | -------------------------------------------------------------------------- |
| `app/(marketing)`          | Public landing at `/`                                                      |
| `app/(protected)`          | Tenant product (`/home`, lead-gen, messaging, voice-agent, manage-tenants) |
| `app/(public)`             | Sign-in                                                                    |
| `app/api`                  | BFF (scrape proxy, session, NL, …)                                         |
| `app/actions`              | Server actions → Mongo via `@aixellabs/backend/db`                         |
| `config/`                  | Route / sidebar / submodule URL SSOT                                       |
| `lib/auth` + `server/auth` | Firebase ↔ Mongo session                                                   |
| `components/`              | Shared UI (`ui/`, `common/`, layout)                                       |
| `hooks/`                   | Cross-route hooks (lead-gen scraper, NL chat/query, …)                     |
| `contexts/`                | `PageProvider` / `usePage` page shell                                      |
| `brand-guidelines/`        | Brand pack for humans + AI                                                 |

Schema SSOT for Docs / `LeadData` / modules: `@aixellabs/backend` (`backend/src/db`).

## Lead generation (today)

Under `app/(protected)/lead-generation/`: Google Maps (+ advanced), Google
Advanced Search, Instagram Search, Facebook, LinkedIn (company; people behind a
flag), lead lists. Credits debit only after successful save (`createUserLeads`).

Incomplete relative to backend: Instagram Advanced UI, website-contacts wiring,
YouTube / Trends product UI.

## Agents

Conventions, skills, and governors: [`AGENTS.md`](./AGENTS.md).  
Auth detail: [`lib/auth/README.md`](./lib/auth/README.md).  
Brand: [`brand-guidelines/`](./brand-guidelines/).
