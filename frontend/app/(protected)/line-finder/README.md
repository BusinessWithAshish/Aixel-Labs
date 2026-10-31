# LineFinder — product planning

`LineFinder` finds the moment a known person said a line on YouTube. Type
Puneet Superstar and "mere paas bahut paisa hai", and get the exact second as a
timestamp link and a player, or a plain "not found" with what was searched.

## Status

Phase 1 in progress (started 2026-10-31): the private engine and its two pages.
Deployed. Not done: the 100-search accuracy test. Nothing is public: it needs a
sign-in and the `LINE_FINDER` module.

## Product documents

- [PRD](./PRD.md) — who it is for, what v1 contains, what it leaves out
- [Search specification](./SEARCH_SPEC.md) — how a line is matched, ranked and
  labelled, turn by turn, with examples
- [Technical architecture](./TECHNICAL_ARCHITECTURE.md) — tenant and module
  model, folder layout, storage, delivery order

Research behind this: [`research/celebrity-clip-search/`](../../../../research/celebrity-clip-search/README.md)
and its [product plan](../../../../research/celebrity-clip-search/product-plan.md).

## Where the code is

- Finding videos and captions: `backend/src/api/line-finder/` (stateless)
- Shapes: `backend/src/db/types.ts`
- Search, saving and the worker: `frontend/server/line-finder/`
- What the pages call: `frontend/app/actions/line-finder-actions.ts`
- Pages: `frontend/app/(protected)/line-finder/search` and `/people`

## Working decisions

- Tenant: `linefinder`, a normal internal tenant, **not** type `PRODUCT`. Products
  stay signed-out. Host `linefinder.aixellabs.in`
- Module: `LINE_FINDER`. The tenant's default access grants this module only
- Storage: Mongo, through server actions, like the rest of the app
- Product name: **LineFinder**. English, says what it does
- Spoken words only, YouTube only, no downloads of any kind
- The `line-finder` page flag is on, so module access decides who sees it. Admins see it on every tenant
