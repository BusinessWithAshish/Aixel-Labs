---
name: frontend-code-page-shell
description: >-
  Wire a protected page with PageProvider, route _hooks, PageLayout, and
  withPageHandler / withAdminOnly in Aixel Labs. Use when adding a new
  App Router page that needs client state, server-fetched initial data, or
  when refactoring prop-drilled page logic into usePage.
---

# Frontend page shell

Executor for the standard page composition. Deeper PageStore examples live in
`frontend/contexts/README.md`.

Governor: `.cursor/rules/frontend/code/page-shell.mdc` (contexts) + feature rules for the route.

## Default composition

```
page.tsx
  → (optional) server fetch
  → PageProvider({ usePageHook } | { data, usePageHook })
  → PageLayout({ title })
  → route _components via usePage<Use*Return>()
export default [withAdminOnly](withPageHandler(Page))  // when async / admin
```

| Piece | Path |
|-------|------|
| Provider / `usePage` | `contexts/PageStore.tsx` |
| Layout chrome | `components/common/PageLayout.tsx` |
| Suspense + error boundary | `components/hocs/with-page-handler.tsx` |
| Admin gate | `components/hocs/with-admin.tsx` |
| Route guard (layouts) | `components/hocs/with-route-guard.tsx` |
| Page logic hook | `app/(…)/_hooks/use-*-page.ts` or `use-*-form.ts` |

## Two PageProvider modes

| Mode | Hook signature | Page |
|------|----------------|------|
| Client-only | `() => T` | Client or server page wrapping provider |
| Server data | `(data: TData) => T` | **Async server** page passes `data={…}` |

Always export `UseXxxReturn = ReturnType<typeof useXxx>`. Mark page hooks `'use client'`.

## Other contexts (rarely extended)

| Context | Role |
|---------|------|
| `TenantBranding` | Logo + theme colors from layout |
| `NavigationLoader` | Full-screen loader via `eventBus` |

Do **not** invent a third page-state context — extend PageStore usage instead.

## Checklist (new page with state)

1. Add `_hooks/use-*-page.ts` (or form hook) with exported return type.
2. Wrap with `PageProvider`; children call `usePage<Use*Return>()`.
3. Use `PageLayout` for title/header; pass `creditModule` patterns only in lead-gen (lead-gen skill).
4. Admin pages: `withAdminOnly(withPageHandler(Page))` — frontend-business-tenants skill.
5. Lead-gen scrapers: also follow `frontend-business-lead-generation` (presets, credits).

## Related skills

- Shared UI → `frontend-code-components`
- Lead forms → `frontend-business-lead-generation`
- Manage tenants → `frontend-business-tenants`
- Shared hooks extraction → `frontend-code-hooks`
