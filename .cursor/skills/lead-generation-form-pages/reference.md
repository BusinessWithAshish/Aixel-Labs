# Reference: files to mirror

## Instagram Search (`instagram-search/`)

| File | Role |
|------|------|
| `page.tsx` | `PageProvider`, `useInstagramForm`, outer Tabs, imports components by path |
| `_hooks/use-instagram-form.ts` | `INSTAGRAM_REQUEST` + `INSTAGRAM_REQUEST_SCHEMA`, location options, `onSubmit` |
| `_components/InstagramSearchFormWrapper.tsx` | Card: `CardTitle` + `next/image` logo, `CardDescription`, **`CardAction`** + `FormPresetScraperActions`; `CardContent`: inner tabs, single `FormProvider` + `<form>` wrapping all `TabsContent` |
| `_components/InstagramQueryForm.tsx` | Query-mode fields via `*ControlledField` |
| `_components/InstagramUsernamesForm.tsx` | Single `StringArrayControlledField` for `entities` |
| `types.ts` | Optional local types only (not the main API request type) |

## Google Maps (`google-maps/`)

| File | Role |
|------|------|
| `page.tsx` | Same outer shell; imports from `./_components` barrel |
| `_hooks/use-google-maps-form.ts` | `GMAPS_INTERNAL_REQUEST` + schema from `@aixellabs/backend/gmaps` |
| `_components/GoogleMapsFormWrapper.tsx` | Same as Instagram: logo in title, presets in **`CardAction`**, one `FormProvider` + `<form>` around inner `TabsContent` |
| `_components/GoogleMapsQueryForm.tsx` | Query fields including `SearchableMultiSelectControlledField` for `cities` |
| `_components/GoogleMapsUrlsForm.tsx` | URL mode fields |
| `_components/index.ts` | Re-exports for the page |

## Shared dependencies

- `@/contexts/PageStore` — `PageProvider`, `usePage`
- `@/components/common/PageLayout`
- `@/components/ui/tabs`, `@/components/ui/card`
- `@/components/common/FormPresetScraperActions`, `FORM_PRESET_STORAGE_KEYS`
- `@/components/common/zod-form-builder/ZodControlledFields` (+ `ZodSearchableSelectField` when needed)
- `@/lib/api-client`, `@aixellabs/backend/config` (`API_ENDPOINTS`)
