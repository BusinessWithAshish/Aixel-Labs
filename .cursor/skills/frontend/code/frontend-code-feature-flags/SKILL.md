---
name: frontend-code-feature-flags
description: >-
  Add or change Aixel Labs product feature flags in frontend/flags.ts and gate UI
  with FeatureFlagGate. Use when adding FeatureFlagKey, NL chat module flags,
  LinkedIn-by-people, or wiring evaluateFlag / isNlChatEnabled. For Flags SDK
  library APIs see flags-sdk-nextjs.
---

# Frontend feature flags

Executor for **this app’s** flag registry and gates. SDK reference:
`.cursor/skills/external/flags-sdk-nextjs/SKILL.md` — do not re-document `flag()` options here.

Governor: `.cursor/rules/frontend/code/ui.mdc`.

## SSOT

| Piece | Path |
|-------|------|
| Keys + `flag()` defs + `evaluateFlag` | `frontend/flags.ts` |
| UI soft-gate | `components/common/FeatureFlagGate.tsx` → `ComingSoon` when off |
| NL chat server check | `isNlChatEnabled(module)` used by `app/api/nl-chat` |

Today flags use `decide() { return false }` / `defaultValue: false` (off until flipped in code or a provider is wired).

## Add a new flag

1. Add `FeatureFlagKey.MY_FLAG = 'kebab-key'`.
2. Export `myFlag = flag<boolean>({ key, description, defaultValue, decide })`.
3. Register in `FLAG_BY_KEY` (must satisfy `Record<FeatureFlagKey, …>`).
4. Gate UI: `<FeatureFlagGate flagKey={FeatureFlagKey.MY_FLAG}>…</FeatureFlagGate>` (Server Component).
5. If NL chat module: extend `NlChatModule` + `NL_CHAT_MODULE_TO_FLAG_KEY` + `hooks/use-nl-chat` module set + `app/api/nl-chat` registry (api-routes / hooks skills).

## Hide an unfinished page

1. Add the key, a one-line `pageFlag(key, description, false)` and its `FLAG_BY_KEY` entry in `flags.ts`.
2. Map the submodule (or every submodule of an unbuilt module via `wholeModule`) in `SUB_MODULE_FLAG_KEY`.
3. Nothing else: `getHiddenSubModules(user)` drops it from the sidebar (`generateSidebarConfig`) and the path ACL (`withRouteGuard` → 404), admins included. Ship it by flipping `false` → `true`.

Admins on `PREVIEW_TENANT` (`test`) see every flagged page; every other tenant (`app` is production) shows only shipped pages, to admins too. Normal users on any tenant still need the submodule in their `moduleAccess`.

Dev override without a deploy: `vercel-flag-overrides` cookie = `encryptOverrides({ key: true })` (needs `FLAGS_SECRET`); `e2e/navigation/hidden-pages.spec.ts` shows it.

## Patterns

- Prefer `evaluateFlag(key)` / `FeatureFlagGate` over calling individual flag functions from random call sites.
- Server Components and Route Handlers may await flags; do not invent a client-only duplicate map.
- Product “coming soon” = flag off + `FeatureFlagGate`, not a separate stub page (unless the whole route is unfinished).

## Related

- SDK details → `flags-sdk-nextjs`
- Lead-gen NL chat pages → `frontend-business-lead-generation` + `frontend-code-hooks` (`use-nl-chat`)
- API enforcement → `frontend-code-api-routes`
