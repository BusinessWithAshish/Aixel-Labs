---
name: frontend-business-lead-generation
description: >-
  Build or extend lead-generation scraper pages in the Aixel Labs frontend
  (forms, hooks, presets, result cards, credits, lead-gen-api wiring). Use when
  adding a new lead type, integrating a backend lead API with
  frontend/app/(protected)/lead-generation/, or editing Google Maps / Google
  Advanced Search / Instagram / Facebook / LinkedIn lead-gen flows.
---

# Lead-generation form pages

End-to-end pattern for product lead scrapers under `frontend/app/(protected)/lead-generation/`.

## Pipeline (do not invent a parallel path)

```
page.tsx
  → PageProvider(use*Form)
  → *FormWrapper
      FormProvider + LeadFormWrapper(creditModule, actions=FormPresetScraperActions)
        → form fields (*QueryForm via ZodControlledFields)
  → FormPresetScraperActions saves/loads preset, then prepareLeadGenListName + onSubmit
  → useLeadGenScraper(subModule).submitLeadGenScraperForm
  → POST /api/lead-gen/scrape { subModule, body }   // abortable; no debit
  → helpers/lead-gen-api.generateLeads → BE product API
  → createUserLeads(subModule, LeadData[], { listName })  // debit + Mongo
```

Preset is required before run. List name comes from the loaded/saved preset via `prepareLeadGenListName` (`{presetName} · Sat 6:10 PM`).

## Key shared files

| Concern | Path |
|---------|------|
| Page state | `contexts/PageStore.tsx` (`PageProvider` / `usePage`) |
| Form shell + cost badge | `components/common/LeadFormWrappers.tsx` |
| Preset save/load/run/abort | `components/common/FormPresetScraperActions.tsx` |
| Submit + abort + save | `hooks/use-lead-gen-scraper.ts` |
| Scrape BFF | `app/api/lead-gen/scrape/route.ts` |
| BE dispatch | `helpers/lead-gen-api.ts` |
| Credit costs | `helpers/credits.ts` |
| Debit + Mongo | `app/actions/user-lead-actions.ts` (`createUserLeads`) |
| Field primitives | `components/common/zod-form-builder/ZodControlledFields.tsx` |
| Result cards | `components/common/lead-card/*` → wire in `leads/[listId]/_components/LeadListItem.tsx` |
| Routes / scrape path | `config/app-config.ts` (`SubModuleUrls`, `LEAD_GEN_SCRAPE_API_ROUTE`) |
| Sidebar icons | `config/sidebar.config.ts` (`subModuleIconMap`) |

## Backend product API contract

Lead APIs must return `ALApiResponse<LeadItem[]>` where each item has `id: string` (Mongo `sourceId`).

| Submodule | Endpoint | Lead item type |
|-----------|----------|----------------|
| `GOOGLE_MAPS` | `GMAPS.INTERNAL` | `GMAPS_INTERNAL_RESPONSE` |
| `GOOGLE_MAPS_ADVANCED` | `GMAPS.ADVANCED` | `GMAPS_DETAILS_RESPONSE` |
| `GOOGLE_ADVANCED_SEARCH` | `GSEARCH.SEARCH` | `GSEARCH_RESPONSE` (= `GSEARCH_RESULT` with `id`) |
| `INSTAGRAM_SEARCH` | `INSTAGRAM.API` | `INSTAGRAM_RESPONSE` |
| `FACEBOOK` | `FACEBOOK.API` | `FACEBOOK_RESPONSE` |
| `LINKEDIN` | `LINKEDIN.API` | `LINKEDIN_BY_COMPANY_RESPONSE` / `LINKEDIN_BY_PEOPLE_RESPONSE` |

- Put `id` on the result/response type itself — do **not** add a FE mapper that unwraps envelopes.
- `lead-gen-api.ts` switch cases are one-liners: `apiClient.post(ENDPOINT, body, options)`.
- Internal helpers may keep richer envelopes for discovery; the **HTTP product handler** still returns the lead array.

## Which folder to mirror

| Pattern | Mirror |
|---------|--------|
| Single form (preferred default) | `google-advanced-search/` |
| One RHF form + input-mode tabs (Query / Pages / Usernames) | `facebook/` or `instagram-search/` |
| Two independent RHF forms (separate presets) | `linkedin/` (`moduleSegment`) |
| Form + NL chat page tabs | `instagram-search/page.tsx` / `google-maps/page.tsx` |

## Route folder layout

```
google-advanced-search/
├── page.tsx                      # PageProvider + PageLayout + *FormWrapper
├── _constants.ts                 # defaults, form id, select option arrays
├── _hooks/use-*-form.ts          # RHF + zodResolver + location options + onSubmit
└── _components/
    ├── *FormWrapper.tsx          # FormProvider + LeadFormWrapper + FormPresetScraperActions
    └── *QueryForm.tsx            # ZodControlledFields only
```

Optional: `_static-data/` for large option lists; `*ScraperChat.tsx` only when a feature flag already exists.

### `page.tsx` shell

```tsx
<PageProvider usePageHook={useXxxForm}>
  <PageLayout className="space-y-4" title="…">
    <XxxFormWrapper />
  </PageLayout>
</PageProvider>
```

### `*FormWrapper.tsx` anatomy

1. `usePage<UseXxxFormReturn>()` for `form` + `onSubmit`
2. `FormProvider {...form}` so presets can `useFormContext`
3. `LeadFormWrapper` with `config` (title, description, icon) + **`creditModule={SUBMODULE}`**
4. `actions={<FormPresetScraperActions module={SUBMODULE} onSubmit={onSubmit} />}`
5. `<form id={FORM_NAME} onSubmit={form.handleSubmit(onSubmit)}>` wrapping field components

Dual-form modules (LinkedIn): pass `moduleSegment` (`"people"` / `"company"`) so presets do not collide. Wrap each form’s actions/fields in its own `FormProvider`.

### Hook pattern (`_hooks/use-*-form.ts`)

- `useLeadGenScraper(SUBMODULE)` → `submitLeadGenScraperForm`
- `useForm` + `zodResolver(BACKEND_REQUEST_SCHEMA)` + `defaultValues` from `_constants.ts`
- `onSubmit` → `submitLeadGenScraperForm({ body, onSuccess: () => form.reset(defaults) })`
- Location cascades (when needed): `country-state-city` → `countryOptions` / `stateOptions` / `cityOptions` + disabled flags; expose via hook return for the query form

### Field conventions

- Zod schema from backend (`@aixellabs/backend/<module>/schemas`) — no duplicated FE schemas.
- Defaults + labeled select options live in route `_constants.ts` (not inline in the form).
- Render fields with `StringControlledField` / `NumberControlledField` / `SelectControlledField` / `SearchableSelectControlledField` from `ZodControlledFields`.
- Location: country → state → city/region via `country-state-city` (same as Facebook / Google Advanced Search).
- Skip NL chat unless a `FeatureFlagGate` + `*ScraperChat` already exist for that module.

## Frontend checklist (new submodule)

### Backend / types

1. Product API returns `ALApiResponse<LeadItem[]>` with `id` on each item.
2. **Schema SSOT first:** add `LEAD_GENERATION_SUB_MODULES` + `LeadSource` values; extend `LeadData` union in `backend/src/db/types.ts` (`.cursor/skills/backend/backend-db/SKILL.md`). Do not invent parallel FE lead payload types.
3. Export request/response schemas and types from `@aixellabs/backend/…`.

### Routing / access UI

4. `SubModuleUrls[SUBMODULE]` in `frontend/config/app-config.ts`.
5. `subModuleIconMap[SUBMODULE]` in `frontend/config/sidebar.config.ts`.
6. Optional home tile: `DASHBOARD_LEAD_SOURCES` + `DASHBOARD_SOURCE_META` in `frontend/app/(protected)/_constants.ts`.

### Credits + dispatch

7. `CREDIT_COST_PER_ITEM[SUBMODULE] = N` in `frontend/helpers/credits.ts` (existing scrapers use **1**).
8. `getLeadSoruceFromSubModule` + `getLeads` cases in `frontend/helpers/lead-gen-api.ts` (one-liner `apiClient.post`).

### Page + results

9. Route folder as above; always pass `creditModule` into `LeadFormWrapper`.
10. Result card in `components/common/lead-card/` + switch branch in `LeadListItem.tsx`.
11. Filters (optional): `FilterSource` / `SOURCE_META` / `FILTERABLE_SOURCES` (+ matchers/sort) under `leads/_utils/`.

## Credits rules

- Admins / `creditsExempt` never see cost UI or exhausted dialogs (`CreditCostNotice` self-hides).
- Charge = `itemCount * getCreditCostPerItem(subModule)` inside `createUserLeads` only — never on the scrape route.
- After success, only show `CreditsExhaustedDialog` when `!creditsExempt && remainingCredits === 0`.
- Abort cancels scrape via `AbortSignal`; if aborted after scrape, skip debit/save.

## Do not

- Invent a second submit/debit path outside `useLeadGenScraper` + `createUserLeads`.
- Unwrap BE envelopes in `lead-gen-api.ts`.
- Build lead-gen forms without `LeadFormWrapper` / `FormPresetScraperActions`.
- Duplicate Zod request schemas on the FE.
- Show credits UI to admins / exempt users.

## Related

- Governor: `.cursor/rules/frontend/business/lead-generation.mdc`
- **DB schema SSOT:** `.cursor/skills/backend/backend-db/SKILL.md` (`LeadData` / `LeadSource` / submodules)
- Backend API module: `.cursor/skills/backend/backend-api-module/SKILL.md`
- Page shell: `.cursor/skills/frontend/code/frontend-code-page-shell/SKILL.md`
- Scraper hook: `.cursor/skills/frontend/code/frontend-code-hooks/SKILL.md` (placement) — pipeline owned here
- Scrape BFF route: `.cursor/skills/frontend/code/frontend-code-api-routes/SKILL.md` (no debit on scrape)
- Submodule URL/icon: `.cursor/skills/frontend/code/frontend-code-config/SKILL.md`
- NL chat flags: `.cursor/skills/frontend/code/frontend-code-feature-flags/SKILL.md`
- Debit/save actions: `.cursor/skills/frontend/mutations/frontend-mutations-server-actions/SKILL.md`
- Skill ↔ governor map: `frontend/AGENTS.md` → “Skills (executors) and rules (governors)”
