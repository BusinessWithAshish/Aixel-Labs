# Frontend AGENTS.md

Conventions for `frontend/`. Combined with root [`AGENTS.md`](../AGENTS.md) when
working under this tree ([nested AGENTS.md](https://cursor.com/docs/rules.md#agentsmd)).

How skills/rules attach: [`.cursor/README.md`](../.cursor/README.md).

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind + shadcn/ui (`components/ui/`)
- Forms: react-hook-form + Zod (`zod-form-builder`)
- Server mutations: Next.js server actions under `app/actions/`
- Auth: custom Firebase + session cookie (`lib/auth`, `server/auth`)
- **Brand pack (paste into any AI):** [`brand-guidelines/BRAND.md`](brand-guidelines/BRAND.md) + `brand-guidelines/assets/`

## Commands

```bash
pnpm --filter frontend dev      # port 3003
pnpm --filter frontend lint
pnpm --filter frontend types
pnpm --filter frontend build
```

## Code style

- Prefer named exports; default exports only when Next.js requires them (`page.tsx`, `layout.tsx`, route handlers).
- Match existing folder conventions: route folders kebab-case; components PascalCase; hooks `use-*.ts`.
- Colocate route UI under `app/(protected)/…/_components` and `_hooks`.
- Import shared backend types/schemas from `@aixellabs/backend/…` — do not duplicate Zod schemas or Doc/`LeadData`/module enums on the FE when `backend/src/db` or the API module already exports them (schema SSOT: `.cursor/skills/backend/backend-db/SKILL.md`).
- Use `cn()` from `@/lib/utils` for className merges.
- Keep components focused; extract shared UI into `components/common/` rather than copying across lead-gen pages.
- Follow Prettier + `eslint-config-next` / prettier; do not fight the formatter.
- Skills index: [`.cursor/skills/README.md`](../.cursor/skills/README.md). Rules (shared governors): [`.cursor/rules/README.md`](../.cursor/rules/README.md).

## Architecture boundaries

| Concern | Where it lives |
|---------|----------------|
| **DB schema SSOT** (Docs, `LeadData`, modules, collections) | `backend/src/db` → `@aixellabs/backend/db` (`.cursor/skills/backend/backend-db/SKILL.md`) |
| Credit costs / tone helpers | `helpers/credits.ts` |
| Credit debit / exempt check | `app/actions/credit-db.ts` (server-only) |
| Credits UI | `components/common/credits/*` |
| Lead-gen submit + save | `hooks/use-lead-gen-scraper.ts` + `app/actions/user-lead-actions.ts` |
| Form shell (card + cost badge) | `components/common/LeadFormWrappers.tsx` |
| Module access / admin routes | `helpers/module-access-helpers.ts` (`getDefaultModuleAccess` = full-access SSOT), `helpers/sidebar-config-helpers.ts` |
| Page state | `contexts/PageStore.tsx` + route `_hooks` |
| Auth session / membership | `lib/auth/*` (client-safe) + `server/auth/*` (server-only) |
| BE HTTP (server) vs Next `/api` (browser) | `lib/api-client.ts` vs `lib/app-api-client.ts` |
| Route / submodule URL SSOT | `config/app-config.ts` (`SubModuleUrls`) |
| Product feature flags | `flags.ts` + `FeatureFlagGate` |

## Skills (executors) and rules (governors)

Skills **build / refactor / edit**. Rules are **shared governors** (not 1:1 with skills). Many skills may follow one rule; external/common skills are often **unruled**. Each hard rule lives in exactly one governor; layered attach is OK when roles differ (e.g. UI + lead-gen on lead cards).

### Governors (concern → rule)

| Concern | Governor | Typical globs |
|---------|----------|---------------|
| Shared UI / FeatureFlagGate | `.cursor/rules/frontend/code/ui.mdc` | `components/**` |
| PageProvider / contexts | `.cursor/rules/frontend/code/page-shell.mdc` | `contexts/**` |
| Hooks / helpers / non-auth lib | `.cursor/rules/frontend/code/modules.mdc` | hooks + helpers (excl. credits/lead-gen-api) + lib clients |
| API BFF + config/middleware | `.cursor/rules/frontend/code/surfaces.mdc` | `app/api/**`, `config/**`, `middleware.ts` |
| Auth / membership / session cookie | `.cursor/rules/frontend/auth.mdc` | `lib/auth/**`, `server/auth/**`, `lib/firebase/**`, `auth-actions` |
| Server actions / debit / cascade | `.cursor/rules/frontend/mutations.mdc` | actions (excl. auth-actions), `server/leads`, `server/coupons` |
| Lead-gen product / credits | `.cursor/rules/frontend/business/lead-generation.mdc` | lead-gen routes, credits, lead-gen-api, lead cards, form shells |
| Manage tenants | `.cursor/rules/frontend/business/tenants.mdc` | `manage-tenants/**` |
| **DB schema SSOT** (cross-package) | `.cursor/rules/backend/db.mdc` | `backend/src/db/**` |
| Backend mounts / boot | `.cursor/rules/backend/platform.mdc` | `config.ts`, `routes.ts`, `server.ts` |

### Executor skills (folder → skill name)

| Folder | Skill `name` | Primary governor(s) |
|--------|--------------|---------------------|
| `skills/frontend/code/frontend-code-components` | `frontend-code-components` | `ui` |
| `skills/frontend/code/frontend-code-page-shell` | `frontend-code-page-shell` | `page-shell` |
| `skills/frontend/code/frontend-code-hooks` | `frontend-code-hooks` | `modules` |
| `skills/frontend/code/frontend-code-api-routes` | `frontend-code-api-routes` | `surfaces` |
| `skills/frontend/code/frontend-code-config` | `frontend-code-config` | `surfaces` |
| `skills/frontend/code/frontend-code-feature-flags` | `frontend-code-feature-flags` | `ui` (gate); `flags.ts` skill-owned |
| `skills/frontend/auth/frontend-auth-session` | `frontend-auth-session` | `auth` |
| `skills/frontend/mutations/frontend-mutations-server-actions` | `frontend-mutations-server-actions` | `mutations` (+ schema via `backend-db`) |
| `skills/frontend/business/frontend-business-lead-generation` | `frontend-business-lead-generation` | `lead-generation` (+ layered; schema via `backend-db`) |
| `skills/frontend/business/frontend-business-tenants` | `frontend-business-tenants` | `tenants` (+ layered; schema via `backend-db`) |
| `skills/backend/backend-platform` | `backend-platform` | `backend/backend-platform` |
| `skills/backend/backend-db` | `backend-db` | `backend/backend-db` (**schema SSOT**) |
| `skills/backend/backend-api-module` | `backend-api-module` | `backend/backend-api-module` |
| `skills/backend/backend-utils` | `backend-utils` | `backend/backend-utils` |
| `skills/backend/backend-mcp` | `backend-mcp` | `backend/backend-mcp` |

## Role & credits product rules (mandatory)

- **`isAdmin === true` ⇒ `creditsExempt`**. Admins are never charged and must not see credits product UI.
- Hide for exempt users: header `CreditsBadge`, form `CreditCostNotice`, account credits card, exhausted dialog.
- After lead generation, only show `CreditsExhaustedDialog` when `!creditsExempt && remainingCredits === 0`.
- Enforcement is server-side (`assertAndDebitCredits` / `getUserCreditsState`). UI hiding is required but not sufficient.
- Canonical pattern: gate UI on `UserCreditsState.exempt` (or `CreateUserLeadsResult.creditsExempt`), same as `CreditsBadge` / `CreditCostNotice`.

## Lead-generation forms

When adding or editing scraper forms under `app/(protected)/lead-generation/`, follow `.cursor/skills/frontend/business/frontend-business-lead-generation/SKILL.md` and `.cursor/rules/frontend/business/lead-generation.mdc`. Always pass `creditModule` into `LeadFormWrapper` for billed modules — the wrapper's `CreditCostNotice` self-hides for admins. Abort cancels `POST /api/lead-gen/scrape` via `AbortSignal`; debit/save only runs in `createUserLeads` after scrape succeeds.

## Manage tenants (admin)

When changing `app/(protected)/manage-tenants/` or related tenant/user/coupon admin actions, follow `.cursor/skills/frontend/business/frontend-business-tenants/SKILL.md` and `.cursor/rules/frontend/business/tenants.mdc`. Admins can mutate any tenant; target by the tenant/user/coupon in the request.

## Shared components

When adding or refactoring UI under `components/` (or promoting route `_components` into shared UI), follow `.cursor/skills/frontend/code/frontend-code-components/SKILL.md` and `.cursor/rules/frontend/code/ui.mdc`. Prefer named exports, compose `ui/` primitives with `cn()`, keep route-only UI colocated, and put multi-file domains under `components/common/<domain>/`.

## Page shell / contexts / hooks

- New page with client state: `.cursor/skills/frontend/code/frontend-code-page-shell/SKILL.md` (`PageProvider` + route `_hooks` + `PageLayout`).
- Shared hooks under `hooks/`: `.cursor/skills/frontend/code/frontend-code-hooks/SKILL.md`.

## Auth

When changing login, session cookies, membership, device fingerprint, or admin/tenant guards, follow `.cursor/skills/frontend/auth/frontend-auth-session/SKILL.md` and `frontend/lib/auth/README.md`.

## Config / middleware / API / flags

- New submodule URL, sidebar icon, or tenant middleware: `.cursor/skills/frontend/code/frontend-code-config/SKILL.md`
- Next.js `app/api` Route Handlers: `.cursor/skills/frontend/code/frontend-code-api-routes/SKILL.md` (scrape debit rules still owned by lead-gen / mutations)
- Product flags + `FeatureFlagGate`: `.cursor/skills/frontend/code/frontend-code-feature-flags/SKILL.md` (Flags SDK library: `.cursor/skills/external/flags-sdk-nextjs`)

## Server actions

When adding or editing files under `app/actions/` (except auth session cookies), follow `.cursor/skills/frontend/mutations/frontend-mutations-server-actions/SKILL.md` and `.cursor/rules/frontend/mutations.mdc`. Use `runAuthenticatedAction` / `runPublicAction`, return `ALApiResponse<T>`, keep debit logic in `credit-db.ts`, and do not pull firebase/auth into public middleware-safe actions.

## Things to avoid

- DO NOT show credit cost, balance, or exhausted messaging to admins / exempt users.
- DO NOT invent a second credits cost map — use `CREDIT_COST_PER_ITEM` / `getCreditCostPerItem`.
- DO NOT put debit logic in client components.
- DO NOT add new card/layout patterns for lead-gen forms; reuse `LeadFormWrapper`.
- DO NOT use `any`; narrow with Zod or existing types.
