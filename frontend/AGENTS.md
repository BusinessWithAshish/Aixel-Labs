# Frontend AGENTS.md

Conventions for `frontend/`. Root [`AGENTS.md`](../AGENTS.md) covers monorepo tooling.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind + shadcn/ui (`components/ui/`)
- Forms: react-hook-form + Zod (`zod-form-builder`)
- Server mutations: Next.js server actions under `app/actions/`
- Auth: custom Firebase + session cookie (`lib/auth`, `server/auth`)

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
- Import shared backend types/schemas from `@aixellabs/backend/…` — do not duplicate Zod schemas on the FE when the backend already exports them.
- Use `cn()` from `@/lib/utils` for className merges.
- Keep components focused; extract shared UI into `components/common/` rather than copying across lead-gen pages.
- Follow Prettier + `eslint-config-next` / prettier; do not fight the formatter.

## Architecture boundaries

| Concern | Where it lives |
|---------|----------------|
| Credit costs / tone helpers | `helpers/credits.ts` |
| Credit debit / exempt check | `app/actions/credit-db.ts` (server-only) |
| Credits UI | `components/common/credits/*` |
| Lead-gen submit + save | `hooks/use-lead-gen-scraper.ts` + `app/actions/user-lead-actions.ts` |
| Form shell (card + cost badge) | `components/common/LeadFormWrappers.tsx` |
| Module access / admin routes | `helpers/module-access-helpers.ts` (`getDefaultModuleAccess` = full-access SSOT), `helpers/sidebar-config-helpers.ts` |

## Role & credits product rules (mandatory)

- **`isAdmin === true` ⇒ `creditsExempt`**. Admins are never charged and must not see credits product UI.
- Hide for exempt users: header `CreditsBadge`, form `CreditCostNotice`, account credits card, exhausted dialog.
- After lead generation, only show `CreditsExhaustedDialog` when `!creditsExempt && remainingCredits === 0`.
- Enforcement is server-side (`assertAndDebitCredits` / `getUserCreditsState`). UI hiding is required but not sufficient.
- Canonical pattern: gate UI on `UserCreditsState.exempt` (or `CreateUserLeadsResult.creditsExempt`), same as `CreditsBadge` / `CreditCostNotice`.

## Lead-generation forms

When adding or editing scraper forms under `app/(protected)/lead-generation/`, follow `.cursor/skills/lead-generation-form-pages/SKILL.md` and `.cursor/rules/lead-generation.mdc`. Always pass `creditModule` into `LeadFormWrapper` for billed modules — the wrapper's `CreditCostNotice` self-hides for admins. Abort cancels `POST /api/lead-gen/scrape` via `AbortSignal`; debit/save only runs in `createUserLeads` after scrape succeeds.

## Things to avoid

- DO NOT show credit cost, balance, or exhausted messaging to admins / exempt users.
- DO NOT invent a second credits cost map — use `CREDIT_COST_PER_ITEM` / `getCreditCostPerItem`.
- DO NOT put debit logic in client components.
- DO NOT add new card/layout patterns for lead-gen forms; reuse `LeadFormWrapper`.
- DO NOT use `any`; narrow with Zod or existing types.
