---
name: frontend-code-hooks
description: >-
  Create or refactor shared React hooks under frontend/hooks/ in Aixel Labs
  (lead-gen scraper hook, NL chat/query, theme, mobile). Use when adding a
  cross-route hook, splitting a multi-file hook folder, or deciding hooks/ vs
  route _hooks/.
---

# Frontend hooks

Executor for **shared** client hooks. Route-only hooks stay in
`app/(…)/_hooks/`.

Governor: `.cursor/rules/frontend/code/modules.mdc`.

## Placement

| Location | When |
|----------|------|
| `app/(…)/_hooks/use-*-form.ts` / `use-*-page.ts` | Single route / PageProvider page logic |
| `frontend/hooks/use-*.ts` | Reused across routes or app shell |
| `frontend/hooks/use-<name>/` | Shared hook with ≥2 related modules (types, store, constants) |

Do **not** put page business logic in `frontend/hooks/` just to “share later”.

## Folder map (today)

| Path | Role | Owning feature skill |
|------|------|----------------------|
| `use-lead-gen-scraper.ts` | Scrape → save → credits toast/abort | `frontend-business-lead-generation` |
| `use-nl-chat/` | Multi-turn NL scraper chat | extend here + chat UI components |
| `use-nl-query/` | One-shot NL filter over in-memory data | extend here |
| `use-theme-color.ts` | Tenant theme preference | branding / theme-actions |
| `use-mobile.ts` | Breakpoint helper | shared util |
| `use-prefetch-image-urls.ts` | Image prefetch | shared util |

When editing `use-lead-gen-scraper`, follow the lead-gen skill pipeline — do not invent a parallel submit/debit path.

## Coding pattern

```ts
'use client';

import { useCallback, useState } from 'react';

export type UseExampleReturn = {
    value: string;
    setValue: (next: string) => void;
};

export function useExample(): UseExampleReturn {
    const [value, setValue] = useState('');
    return { value, setValue };
}
```

- Always `'use client'` for hooks that use React state/effects or browser APIs.
- Prefer named exports; export `Use*Return` when consumed via `usePage` or public API.
- Multi-file folders: `use-foo.ts` + `types.ts` + optional `constants.ts` / `store.ts`; barrel `index.ts` only when useful (see `use-nl-chat`).
- localStorage keys via `generateLocalStorageKey` (`helpers/`).
- Same-origin Next API calls → `appApiClient` (`lib/app-api-client.ts`), not `api-client` (server-only BE client).
- Keep Mongo / debit / session policy out of hooks — call actions or `@/server/auth` only from server layers.

## New shared hook checklist

1. Confirm ≥2 call sites (or clear app-shell need); else colocate under route `_hooks/`.
2. Choose flat file vs `use-<name>/` folder.
3. Wire consumers; prefer absolute `@/hooks/…` imports.
4. If the hook owns a product pipeline (scrape, chat turns), document which feature skill remains SSOT for business rules.

## Related skills

- PageProvider page hooks → `frontend-code-page-shell`
- Lead scrape submit → `frontend-business-lead-generation`
- Server mutations called from hooks → `frontend-mutations-server-actions`
