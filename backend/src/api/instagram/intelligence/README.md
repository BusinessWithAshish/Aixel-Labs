# Instagram intelligence (`backend/src/api/instagram/intelligence`)

Mirrors `youtube/intelligence`'s architecture: raw fetch layer stays in
`instagram/client.ts` / `instagram/advanced/client.ts` (never reimplemented
here), this module adds a pure `compute/` layer on top and exposes it via
MCP tools only — no HTTP route, same pattern as `youtube/intelligence/video-meta`.

## Why this exists

`instagram_get_profile` / `instagram_get_posts` return raw stats only. Unlike
YouTube, there was no aggregation layer computing engagement scores, velocity,
or outlier detection — every caller had to do that arithmetic by hand, in
context, every time. This module does it once, in code.

## Mental model

```
instagram_get_account_intelligence          (fetch + enrich, I/O)
  → fetchFromEntities + fetchInstagramAdvancedPosts   (raw layer, unchanged)
  → enrichPost per post                                (compute/ — pure)
  → lean post shape + intelligence block

instagram_aggregate_account_signals          (pure, sync, no I/O)
  → takes the posts array above (single account only)
  → outlier threshold (mean + 2×stddev), score distribution,
    posting cadence, media type mix, reel ratio
```

## Layout

| File | Role |
|---|---|
| `constants.ts` | Engagement weights, outlier threshold, percentile levels, CTA keyword list — SSOT |
| `types.ts` | `WithIntelligence<TRaw, TIntel>`, `INSTAGRAM_POST_INTELLIGENCE_FIELDS` |
| `math.ts` | `simple-statistics` (mean/max/min/stddev) + hand-rolled percentile, same shape as `youtube/intelligence/math.ts` |
| `compute/` | Pure, no-I/O: `engagement.ts`, `velocity.ts`, `text.ts`, `outliers.ts`, `cadence.ts`, `time.ts` |
| `account/` | Resource: `schemas.ts`, `types.ts`, `enrich.ts` (pure), `service.ts` (I/O) |
| `aggregation/` | Pure aggregate: `schemas.ts`, `types.ts`, `account-signals.ts`, `index.ts` barrel |

## Formulas

- **Engagement score**: `likes×1 + comments×3 + views×0.1` (views = `playCount ?? viewCount ?? 0`)
- **Follower-normalized score**: engagement score per 1,000 followers, floored at a 1,000-follower basis
- **Velocity**: normalized score ÷ days since posted, floored at 0.5 days
- **Outlier threshold**: `mean + 2×stddev` of an account's own normalized scores — needs ≥8 posts, else `null`
- **Posting cadence**: average days between consecutive posts

## Deliberate scope cuts

- **No HTTP route.** MCP-only, like `video-meta`. Add one later via the
  `backend-api-module` checklist if a non-MCP consumer needs it — reuse
  `instagramAccountIntelligenceService` as-is, don't fork it.
- **Lean post shape, not `WithIntelligence<IG_ADVANCED_POST, …>`.** The full
  raw post type carries every CDN rendition (`images[]`, `videos[]`,
  `carousel[]`) — a single page from a video-heavy account measured 400K+
  characters in testing and got written to a file instead of returned
  inline. `account/types.ts`'s `INSTAGRAM_POST_LEAN_FIELDS` keeps one URL
  per post via `Pick<IG_ADVANCED_POST, …>` instead.
- **No per-post `isOutlier` flag echoed back.** `aggregation` returns
  `outlierItems` — the already-filtered, already-sorted subset — instead of
  the full post list with a boolean bolted on, so the aggregate response
  stays small regardless of how many posts went in.
- **No synthetic 0–10 "quality" scores.** This module supplies real computed
  numbers (engagement, velocity, outliers, cadence); turning those numbers
  into judgment — strengths, weaknesses, growth suggestions — is the
  analysis layer's job (`.claude/skills/ig-account-scout`,
  `ig-hook-breakdown`), not this module's.

## Rollout status

- [x] `compute/`, `math.ts`, `constants.ts`, `types.ts`
- [x] `account/` (fetch + enrich)
- [x] `aggregation/` (pure aggregate)
- [x] MCP tools: `instagram_get_account_intelligence`, `instagram_aggregate_account_signals`
- [ ] Unit tests for `compute/` (no test runner exists anywhere in this repo yet — same gap `youtube/intelligence` has)
- [ ] HTTP route (add only if a non-MCP consumer needs it)
