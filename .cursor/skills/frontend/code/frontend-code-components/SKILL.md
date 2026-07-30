---
name: frontend-code-components
description: >-
  Create or refactor React components under frontend/components/ in Aixel Labs
  (ui primitives, common product UI, layout, wrappers, HOCs). Use when adding a
  shared component, extracting reusable UI from a route, editing lead-card /
  credits / zod-form-builder / ai-chat-interface, or deciding common vs
  route-local _components placement.
---

# Frontend components

Canonical patterns for `frontend/components/`. Route-only UI stays under
`app/(…)/_components/` — promote here only when reused across routes.

Also see `frontend/AGENTS.md`. Domain skills own product flows
(`frontend-business-lead-generation`, `frontend-business-tenants`); this skill owns **where and how
shared UI is structured**.

## Folder map

| Folder | Role | File naming |
|--------|------|-------------|
| `ui/` | shadcn/reui primitives (Button, Dialog, Card, …) | kebab-case (`button.tsx`) |
| `common/` | Shared product UI reused across routes | PascalCase (`PageLayout.tsx`) |
| `common/<domain>/` | Multi-file feature domains | PascalCase + helpers |
| `layout/` | App chrome (sidebar, nav, tenant switcher) | kebab-case |
| `wrappers/` | Thin composition over `ui/` (ConfirmDialog, labeled input) | PascalCase |
| `hocs/` | Page/layout HOCs (`withAdminOnly`, `withRouteGuard`, `withPageHandler`) | `with-*.tsx` |

### `common/` domains (use a subfolder when ≥2 related files)

| Subfolder | Purpose |
|-----------|---------|
| `credits/` | Balance badge, cost notice, exhausted dialog |
| `lead-card/` | Per-source result cards + shared contact bits |
| `zod-form-builder/` | RHF + Zod field primitives / schema builder |
| `ai-chat-interface/` | NL scraper chat shell |
| `table-export-preview/` | Spreadsheet export preview/edit dialogs |

Single-file utilities stay flat in `common/` (`ComingSoon`, `FeatureFlagGate`, `CommonLoader`, …).

Barrel `index.ts` is rare — only `zod-form-builder` has one. Prefer direct file imports (`@/components/common/…`).

## Where to put a new component

```
Reusable across routes?
  no  → app/(…)/route/_components/Xxx.tsx
  yes → product domain with siblings?
          yes → components/common/<domain>/Xxx.tsx
          no  → thin wrap of ui Dialog/Input?
                  yes → components/wrappers/
                  no  → new shadcn primitive?
                          yes → components/ui/ via shadcn CLI (do not hand-roll)
                          no  → components/common/Xxx.tsx
Page/layout access gate?
  → components/hocs/with-*.tsx
Sidebar / app shell?
  → components/layout/
```

Do **not** put route-specific scraper forms, lead list sheets, or admin tenant tables into `components/common/` — those stay route-colocated.

## Coding pattern (new / refactored)

### Exports & props

- Prefer **named** exports: `export function Foo` / `export const Foo`.
- Default export only when required (Next `page`/`layout`) or matching a long-standing file — do not add new default exports in `components/`.
- Colocate props: `type FooProps = { … }` above the component; export the type when consumers need it.
- No `any`. Prefer backend types from `@aixellabs/backend/…`.

### Client vs server

- Omit `'use client'` unless the file needs hooks, events, browser APIs, or client-only libraries.
- Server Components are fine and preferred for gates/data shells (`FeatureFlagGate`, `AppSidebar`, HOCs that call `getAppSession`).

### Styling

- Merge classes with `cn()` from `@/lib/utils`.
- Accept optional root `className?: string`.
- Multi-slot overrides: optional `classNames?: { slot?: string }` (see `LeadFormWrapper`, `CommonLoader`) — not a second parallel styling system.
- Compose `ui/` primitives (`Button`, `Card`, `Dialog`, `Badge`, …). Do not reimplement them.
- Icons: `lucide-react`.

### Imports

- Absolute aliases: `@/components/…`, `@/lib/utils`, `@/hooks/…`, `@/helpers/…`.
- Avoid deep relative hops across folders (`../../ui/button` → `@/components/ui/button`).

### Composition habits

- Controlled dialogs take `open` + `onOpenChange` (see `wrappers/ConfirmDialog`).
- Product cards accept optional `actions?: ReactNode`, selection props (`showCheckbox`, `isSelected`, `onSelect`) when used in lead lists.
- Soft-gate unfinished surfaces with `FeatureFlagGate` + `ComingSoon`, not ad-hoc stubs.
- Keep debit / auth / Mongo out of presentational components — call helpers, actions, or hooks owned elsewhere.

### Minimal template (`common/`)

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ExampleCardProps = {
    title: ReactNode;
    children: ReactNode;
    className?: string;
    classNames?: {
        header?: string;
        content?: string;
    };
};

export function ExampleCard({ title, children, className, classNames }: ExampleCardProps) {
    return (
        <Card className={className}>
            <CardHeader className={classNames?.header}>
                <CardTitle>{title}</CardTitle>
            </CardHeader>
            <CardContent className={cn('space-y-2', classNames?.content)}>{children}</CardContent>
        </Card>
    );
}
```

## `ui/` rules

- Generated/maintained via shadcn (`components.json`: New York, RSC, lucide, `@/components/ui`).
- Prefer extending with CVA variants on the primitive over forking a parallel Button/Input.
- Custom selects that are still primitives (`searchable-select`, `searchable-multi-select`) live in `ui/`; form-field wiring that needs RHF lives in `common/zod-form-builder/`.

## HOCs (`hocs/`)

| HOC | Use |
|-----|-----|
| `withRouteGuard` | Auth + tenant + module path access for protected layouts |
| `withAdminOnly` | Admin-only pages (non-admin → `notFound`) |
| `withPageHandler` | `ErrorBoundary` + `Suspense` around async pages |

Compose outer→inner: `withAdminOnly(withPageHandler(Page))`. Do not invent new auth wrappers in route files.

## Refactor checklist

1. Confirm reuse — if only one route uses it, keep/move to that route’s `_components/`.
2. Split presentational UI from submit/debit/fetch logic (hooks, actions, helpers).
3. Replace one-off markup with `ui/` + `cn` + existing common shells (`LeadFormWrapper`, `ConfirmDialog`, credits components) when applicable.
4. Align naming: PascalCase product files; `with-*` HOCs; kebab-case `ui/` / `layout/`.
5. Switch default → named export when touching a file for other reasons (unless Next requires default).
6. Add `'use client'` only if the refactor introduces client APIs; remove it if no longer needed.
7. Domain growth: when a second related file appears, create `common/<domain>/` and move siblings together.

## Do not

- Duplicate lead-gen form shells — use `LeadFormWrapper` + `FormPresetScraperActions` (see lead-gen skill).
- Hand-roll new design-system primitives that belong in `ui/`.
- Put server-only debit or session mutation logic inside presentational components.
- Add barrel `index.ts` files unless the domain already uses one and exports are stable.
- Copy components between routes; extract to `common/` once instead.

## Related

- Governor: `.cursor/rules/frontend/code/ui.mdc`
- Page wiring: `.cursor/skills/frontend/code/frontend-code-page-shell/SKILL.md`
- Skill ↔ governor map: `frontend/AGENTS.md` → “Skills (executors) and rules (governors)”
