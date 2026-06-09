---
name: lead-generation-form-pages
description: Builds and iterates on lead-generation scraper form pages using the Instagram Search and Google Maps folder layout—PageProvider tabs, Card form wrapper, react-hook-form + Zod, and zod-form-builder fields. Use when adding or editing a form under frontend/app/(protected)/lead-generation/, when the user supplies a Zod schema and request/response types, or when they ask for the scraper form page template.
---

# Lead generation form pages (template)

## What the user supplies

Before generating or changing files, confirm (or infer from existing backend code):

| Input | Purpose |
|--------|---------|
| **Route folder name** | kebab-case, e.g. `instagram-search`, `google-maps` |
| **Page title** | String for `PageLayout` `title` |
| **Form request type** | TypeScript type for `useForm<T>` and submit payload |
| **Zod schema** | Same shape as the request type; `zodResolver(schema)` in the hook |
| **Default values** | Object matching the schema for `defaultValues` |
| **API** | `API_ENDPOINTS.*` key and `apiClient.post<Response[], Request>` usage |
| **Optional: second form mode** | e.g. Query vs URLs/Usernames—maps to inner `Tabs` in the wrapper |

UI shell (tabs, card, presets, `FormProvider`) follows the reference implementations; **only** schema-driven pieces (hook defaults, field list, types, endpoints, copy) should vary per feature.

## Canonical references (do not invent a new layout)

Study these trees and copy their **structure**, not domain strings:

- `frontend/app/(protected)/lead-generation/instagram-search/`
- `frontend/app/(protected)/lead-generation/google-maps/`

## Directory and file naming

```
{route-folder}/
  page.tsx                          # Server-friendly shell; PageProvider + PageLayout + outer Tabs
  types.ts                          # Optional; page-specific TS helpers (not the main API request type)
  _hooks/
    use-{feature}-form.ts           # 'use client'; useForm, zodResolver, onSubmit, page state
  _components/
    {Feature}SearchFormWrapper.tsx  # Card: CardHeader (title + description + CardAction presets) + CardContent (inner Tabs + FormProvider + <form>)
    {Feature}QueryForm.tsx          # Fields for primary mode (compose *ControlledField)
    {Feature}*Form.tsx             # Additional inner-tab forms as needed
    {Feature}ResultsSection.tsx    # Results tab content
    {Feature}ScraperChat.tsx       # AI Chat tab (if applicable)
    index.ts                        # Optional barrel; google-maps re-exports for shorter page imports
```

**Naming rules**

- **Folder**: kebab-case (`google-maps`).
- **React components**: PascalCase with a clear feature prefix (`GoogleMapsFormWrapper`, `InstagramQueryForm`).
- **Hook file**: `use-{feature}-form.ts` with exported `use{Feature}Form` and `Use{Feature}FormReturn`.
- **Form element `id`**: one exported constant per feature (e.g. `GOOGLE_MAPS_FORM_NAME`, `instagramSearchFormName`)—match existing pages in the same area for consistency.

## Page shell (`page.tsx`)

Pattern:

1. `PageProvider` with `usePageHook={use{Feature}Form}` from `./_hooks/use-{feature}-form`.
2. `PageLayout` with `className="space-y-4"` and the page `title`.
3. Outer `Tabs` with enum labels: `CHAT`, `FORM`, `RESULTS` (and lucide icons `MessageSquare`, `FormInput`, `List`).
4. `TabsContent`: Chat component → Form wrapper → Results section.

Instagram imports components directly; Google Maps may use `./_components` barrel—either is fine if consistent within the route.

## Form hook (`_hooks/use-{feature}-form.ts`)

- `'use client'` at top.
- `useForm<RequestType>({ resolver: zodResolver(SCHEMA), defaultValues })`.
- Export `Use{Feature}FormReturn = ReturnType<typeof use{Feature}Form>`.
- Put **derived options** (country/state/city lists, disabled flags, extra UI state) here; sub-forms read them via `usePage<Use{Feature}FormReturn>()`.
- `onSubmit`: call `apiClient.post`, update leads/results state, return `ConfirmResult` for chat compatibility where used.

Request/schema types usually come from `@aixellabs/backend/...`—do not duplicate Zod definitions on the frontend if the backend package already exports the schema.

## Form wrapper (`*FormWrapper.tsx`)

- `'use client'`.
- `usePage<Use{Feature}FormReturn>()` → `form`, `onSubmit`.
- `Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardAction` / `CardContent`.
- **Header icon**: Use `next/image` with a file from `public/` (same pattern as Instagram `/instagram-logo.svg` and Google Maps `/google-maps.svg`), e.g. `<Image src="/…" alt="…" width={20} height={20} />` in `CardTitle` beside the title. Do not substitute a Lucide icon when a product logo asset exists.
- **`FormPresetScraperActions` placement**: Put it inside **`CardAction`** in `CardHeader`, with `className="flex item-center flex-row w-full gap-2"` to match `instagram-search` and `google-maps`. **Do not** place preset actions inside `TabsContent` or below the tab list—those references keep presets in the card header only.
- Inner `Tabs` for form **modes** (Query vs URLs, etc.) live in **`CardContent`**.
- **Single `useForm` (default)**: One `FormProvider` wrapping one `<form>` that wraps all inner `TabsContent` blocks (fields switch per tab; same form instance)—see Instagram and Google Maps.
- **Multiple `useForm` instances** (e.g. LinkedIn By People vs By Company): Keep one `FormProvider` + `<form>` per mode inside each `TabsContent`. Use **controlled** `Tabs` (`value` / `onValueChange` with `useState`) so **`FormPresetScraperActions` stays in `CardAction`** as a direct child (same layout as Instagram/Google Maps). Conditionally render the preset block for the active tab’s `form`, `storageKey`, and `onSubmit`. **Do not** wrap presets in `TabsContent` inside `CardAction`—that breaks the card header grid alignment.
- Each mode: `TabsContent` + dedicated `*Form` component.

## Field sub-forms (`*QueryForm.tsx`, etc.)

- Import controlled fields from `@/components/common/zod-form-builder/ZodControlledFields` (and `ZodSearchableSelectField` when a field is driven by **local** state not stored in RHF—see Instagram `state` + `selectedState`).
- Use `usePage<Use{Feature}FormReturn>()` for options and flags from the hook.
- Each `name` must match the Zod/request type keys.

**Rough Zod → component map**

| Schema shape | Typical component |
|--------------|-------------------|
| `z.string()` | `StringControlledField` |
| `z.array(z.string())` | `StringArrayControlledField` |
| Single select from options | `SearchableSelectControlledField` |
| Multi select | `SearchableMultiSelectControlledField` |
| Select backed by non-RHF state | `ZodSearchableSelectField` + hook state (Instagram pattern) |

## Presets (`FormPresetScraperActions`)

When adding a **new** preset-enabled scraper form, extend `FORM_PRESET_STORAGE_KEYS` in `frontend/components/common/FormPresetScraperActions.tsx` with a new stable string key and pass it as `storageKey`.

## Iterating on an existing form

1. **Schema / type change**: Update imports in the hook, `defaultValues`, and resolver; adjust TypeScript in wrapper/chat/results if needed.
2. **Fields**: Add/remove/reorder components in the relevant `*Form.tsx`; keep `name` aligned with the type.
3. **New inner tab**: Add enum value, `TabsTrigger` + `TabsContent`, new `*Form.tsx`, split fields by mode.
4. **API**: Update endpoint constant usage and response state typing in the hook and Results section.

## Checklist (new page)

- [ ] `_hooks/use-{feature}-form.ts` with schema, defaults, `onSubmit`, exported return type
- [ ] `*FormWrapper.tsx` with Card, **`CardAction` presets** (not inside tab panels), inner Tabs, `FormProvider`, form `id`
- [ ] Field components per mode using zod-form-builder fields
- [ ] `page.tsx` with `PageProvider`, `PageLayout`, outer Tabs, Chat / Form / Results
- [ ] New `FORM_PRESET_STORAGE_KEYS` entry if presets are used
- [ ] Results (and Chat) wired to the same page store hook return shape

## Additional resources

- Field and special cases: [reference.md](reference.md)
