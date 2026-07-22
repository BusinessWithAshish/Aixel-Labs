---
name: lead-generation-form-pages
description: >-
  Build or extend lead-generation scraper pages in the Aixel Labs frontend
  (forms, hooks, result cards, credits, lead-gen-api wiring). Use when adding a
  new lead type, integrating a backend lead API with
  frontend/app/(protected)/lead-generation/, or editing Google Maps / Instagram /
  LinkedIn / Google Advanced Search lead-gen flows.
---

# Lead-generation form pages

End-to-end pattern for product lead scrapers under `frontend/app/(protected)/lead-generation/`.

## Pipeline (do not invent a parallel path)

```
Form (RHF + backend Zod schema)
  → FormPresetScraperActions (preset required before run)
  → useLeadGenScraper(subModule).submitLeadGenScraperForm
  → POST /api/lead-gen/scrape { subModule, body }
  → helpers/lead-gen-api.generateLeads → BE product API
  → createUserLeads(subModule, LeadData[], { listName })  // debit + Mongo
```

## Backend product API contract

Lead APIs must return `ALApiResponse<LeadItem[]>` where each item has `id: string` (Mongo `sourceId`).

| Submodule | Endpoint | Lead item type |
|-----------|----------|----------------|
| `GOOGLE_MAPS` | `GMAPS.INTERNAL` | `GMAPS_INTERNAL_RESPONSE` |
| `GOOGLE_ADVANCED_SEARCH` | `GSEARCH.SEARCH` | `GSEARCH_RESPONSE` (= `GSEARCH_RESULT` with `id`) |
| `INSTAGRAM_SEARCH` | `INSTAGRAM.API` | `INSTAGRAM_RESPONSE` |
| `LINKEDIN` | `LINKEDIN.API` | LinkedIn company/people response |

- Put `id` on the result/response type itself — do **not** add a FE mapper that unwraps envelopes.
- `lead-gen-api.ts` switch cases are one-liners: `apiClient.post(ENDPOINT, body, options)`.
- Internal helpers (e.g. `fetchGsearch` → `GSEARCH_FETCH_RESPONSE`) may keep richer envelopes for IG/LI discovery; the **HTTP product handler** still returns the lead array.

## Frontend checklist (new submodule)

1. **Credits** — `CREDIT_COST_PER_ITEM[SUBMODULE] = N` in `frontend/helpers/credits.ts`.
2. **Dispatch** — `getLeadSoruceFromSubModule` + `getLeads` cases in `frontend/helpers/lead-gen-api.ts`.
3. **Types** — `LeadSource` + `LeadData` union in `backend/src/db/types.ts`; export schemas/types from `@aixellabs/backend/…`.
4. **Page folder** (mirror `google-advanced-search` or `instagram-search`):
   ```
   google-advanced-search/
   ├── page.tsx
   ├── _constants.ts              # defaults + select option arrays
   ├── _hooks/use-*-form.ts
   └── _components/
       ├── *FormWrapper.tsx       # LeadFormWrapper + FormPresetScraperActions
       └── *QueryForm.tsx
   ```
5. **Form shell** — always pass `creditModule={SUBMODULE}` into `LeadFormWrapper`.
6. **Result card** — `components/common/lead-card/*LeadCard.tsx` + wire in `LeadListItem.tsx`.
7. **Filters (optional)** — add source to `FilterSource` / `SOURCE_META` / `FILTERABLE_SOURCES`.

## Form conventions

- Zod schema from backend (`@aixellabs/backend/<module>/schemas`) — no duplicated FE schemas.
- Select option arrays (time filters, enums with custom labels) live in route `_constants.ts`, not inline in the form component.
- Location cascades: country → state → city/region via `country-state-city` (same as Instagram / Google Advanced Search).
- Skip NL chat unless a feature flag + chat component already exist for that module.

## Credits rules

- Admins / `creditsExempt` never see cost UI or exhausted dialogs.
- Charge = `itemCount * getCreditCostPerItem(subModule)` inside `createUserLeads` only.
- Google Advanced Search cost: **1 credit per lead**.
