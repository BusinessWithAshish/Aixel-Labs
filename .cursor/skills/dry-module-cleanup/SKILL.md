---
name: dry-module-cleanup
description: >-
  Refactors a codebase folder for DRY, single source of truth, small focused
  files, and centralized constants/types. Use when the user asks to clean up,
  deduplicate, extract utilities, consolidate constants, reduce repetition,
  apply SSOT, or optimize module structure without changing API behavior.
---

# DRY Module Cleanup

Refactor a target folder so logic stays identical but structure follows **single source of truth**, **DRY**, and **small files**.

## Principles

1. **No behavior changes** — same inputs, same outputs, same API contracts.
2. **Single source of truth** — define once, derive everywhere.
3. **No string literals for reused values** — routes, labels, thresholds, regex, enum-like strings → `constants.ts`.
4. **No duplicated types** — shared field shapes → root `types.ts`; resource types compose via intersection/`Pick`.
5. **Small files** — one concern per file; split files >150 lines when they mix orchestration + math + types.
6. **Prefer libraries for non-trivial math** — e.g. `simple-statistics` for mean/max/min; keep custom algorithms only when output must stay bit-identical.

## Workflow

Copy this checklist and track progress:

```
Cleanup Progress:
- [ ] Step 1: Inventory the folder
- [ ] Step 2: Extract constants & shared types
- [ ] Step 3: Extract shared pure functions
- [ ] Step 4: Refactor consumers
- [ ] Step 5: Verify build/tests
- [ ] Step 6: Update README
```

### Step 1: Inventory

Read every file in the target folder. For each, note:

| Pattern                                | Action                                    |
| -------------------------------------- | ----------------------------------------- |
| Same literal in 2+ files               | Move to `constants.ts`                    |
| Same type field block in 2+ `types.ts` | Extract building block to root `types.ts` |
| Same pure function in 2+ files         | Move to `compute/` or `helpers/`          |
| Same empty default object              | Single export (e.g. `EMPTY_*`)            |
| Same type guard (`"foo" in item`)      | `type-guards.ts`                          |
| Same map lookup + fallback             | Helper (e.g. `resolveX(map, id)`)         |
| Inline math (avg, percentile, ratio)   | `math.ts`; use npm lib when safe          |
| Handler boilerplate                    | Factory pattern if not already present    |

### Step 2: Constants & types

**`constants.ts`** at folder root:

```typescript
export const MODULE_ROUTES = { ... } as const;
export const MODULE_HANDLER_LABELS = { ... } as const;
export const THRESHOLDS = { ... } as const;
export const PATTERNS = { HASHTAG: /.../g, ... } as const;
```

Derive ordered lists from constants when iterating (e.g. bucket order from enum keys).

**`types.ts`** at folder root:

```typescript
export type WithMeta<TRaw, TMeta> = TRaw & { meta: TMeta };
export type SHARED_FIELD_BLOCK = { fieldA: number | null; ... };
```

Resource `types.ts` files compose:

```typescript
export type RESOURCE_FIELDS = SHARED_FIELD_BLOCK & { extra: string };
```

### Step 3: Shared pure functions

Organize by concern:

```
folder/
├── math.ts              # averages, ratios, percentiles
├── distributions.ts     # counter maps / histograms
├── watch-meta.ts        # shared defaults + resolvers (if applicable)
├── type-guards.ts
├── compute/
│   ├── time.ts
│   ├── velocity.ts
│   └── index.ts         # re-exports
└── helpers.ts           # barrel re-export for consumers
```

Rules:

- `compute/` = deterministic, no I/O, no side effects.
- `{resource}/enrich.ts` = orchestration only (fetch meta, map items, call compute).
- `{resource}/compute.ts` = resource-specific aggregates only; import shared math from `../math`.

### Step 4: Refactor consumers

For each resource file:

1. Replace string literals → constants.
2. Replace duplicated blocks → shared compute/type imports.
3. Replace `EMPTY_*` copies → single import.
4. Replace inline type guards → `type-guards.ts`.
5. Keep handlers thin (~15 lines).

Do **not** change function signatures exposed to routes unless types are structurally identical.

### Step 5: Verify

```bash
cd backend && pnpm build
```

If tests exist for the folder, run them. Fix import/type errors without altering logic.

### Step 6: Update README

Document:

- New folder layout
- Where constants, types, and compute live
- DRY table (concern → location)
- Checklist for adding new fields

## Anti-patterns to remove

| Bad                                        | Good                                                     |
| ------------------------------------------ | -------------------------------------------------------- |
| `const MS_PER_DAY = 86_400_000` in 3 files | `constants.ts` once                                      |
| `const EMPTY = { a: null, ... }` copied    | `watch-meta.ts` or `defaults.ts`                         |
| `item.views / Math.max(days, 1)` repeated  | `safeDivide(n, d)` in `math.ts`                          |
| `{ p25, p50, p75 }` type duplicated        | `PERCENTILE_DISTRIBUTION` in `types.ts`                  |
| 400-line `compute.ts`                      | Split: shared `compute/` + resource `content-metrics.ts` |
| Handler label string literals              | `HANDLER_LABELS` constant                                |

## When to install an npm math library

Search `npm` when the folder has 3+ of: mean, median, percentile, stddev, quantile, histogram.

- Prefer **`simple-statistics`** for mean/max/min.
- **Keep custom percentile logic** if switching libraries would change API numeric output.
- Do not add a library for one-line `a / Math.max(b, 1)` — use a local `safeDivide` instead.

## Scope guardrails

- Only refactor the folder the user named; do not expand scope to parent modules unless asked.
- Do not change API response shapes or business rules.
- Do not add tests unless requested.
- Do not commit unless the user asks.

## Reference implementation

See `backend/src/api/youtube/intelligence/` for a worked example:

- `constants.ts` — routes, labels, thresholds, regex patterns
- `types.ts` — `WithIntelligence`, shared field building blocks
- `compute/` — shared pure functions used by search, video, channel, suggested
- `math.ts` — `simple-statistics` + custom percentiles
- `watch-meta.ts` — `EMPTY_YOUTUBE_VIDEO_WATCH_META`, `resolveWatchMeta`
- `type-guards.ts` — discriminated union guards
