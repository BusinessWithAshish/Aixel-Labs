---
name: ig-account-scout
description: >-
  Use when given one or more Instagram handles (or a niche/topic to discover
  accounts in) and asked to research, rank, or find the best/top-performing/
  viral/outlier posts or reels from those accounts. Calls the Instagram
  intelligence tools to get profile stats, per-post engagement/velocity
  scoring, and statistical-outlier detection already computed, then
  interprets the result into a ranked shortlist per account. This is the
  data-gathering and ranking stage of Instagram competitor/content research.
  Hand the video/reel results to ig-hook-breakdown for the content-analysis
  stage automatically, unless the user only asked for the ranked list itself.
---

# IG Account Scout

Data-gathering and ranking stage. Input: Instagram handle(s), or a niche
description if no handles are given yet. Output: a ranked shortlist of
statistical-outlier posts per account, with enough metadata to hand
video/reel results straight to `ig-hook-breakdown`.

**All scoring, normalization, and outlier detection is computed server-side
by `instagram_get_account_intelligence` and `instagram_aggregate_account_signals`
— don't recompute engagement scores, velocity, or outlier thresholds by
hand. Your job here is to call those two tools and interpret their output,
not to do the arithmetic.**

## Step 1 — Resolve target accounts

If given explicit handles, skip to Step 2.

If given a niche/topic instead (e.g. "find top skincare creators"), discover
candidates first:
- `instagram_search_profiles` (requires `query` + `country`) — default first
  choice, biased toward matching profile titles.
- If results are thin (small/local/niche accounts often don't rank on title
  match), fall back to `instagram_search_content_leads`, which searches
  actual post/reel content instead.
- `instagram_get_popular_topic` is the heaviest option (headless-browser
  based) — reach for it only when the two above are exhausted or you
  specifically want Instagram's own "what's popular right now" signal.

## Step 2 — Fetch + score, one account at a time

`instagram_get_account_intelligence(username, country, pages?)` — fetches the
profile and posts together and returns each post with an `intelligence`
block already computed: `engagementScore`, `followerNormalizedScore`
(per-1,000-followers basis), `velocity` (normalized score ÷ days since
posted), `engagementRatio`, `captionLength`, `hashtagCount`, `hasCTA`.

- **Start with `pages: 1`.** Even the lean response this tool returns grows
  with post count — only raise `pages` for accounts that clearly need a
  bigger sample (posting less than weekly, etc.).
- Call this **one account at a time**, not batched in parallel.
- If `isPrivate: true` comes back, the `posts` array will be empty — note
  the account as private and move on, don't treat it as a fetch failure.
- If an account genuinely has fewer than 8 posts returned, outlier detection
  in Step 3 will come back `null` — that's expected, not a bug; fall back to
  sorting by `velocity` alone (see Step 3).

## Step 3 — Aggregate

`instagram_aggregate_account_signals(items, username?)` — pass the exact
`posts` array from Step 2 for **this account only**. Never combine posts
from different accounts into one call; the outlier threshold is meaningless
across accounts with different follower counts.

This returns, already computed:
- `outlierThreshold` (mean + 2×stddev of follower-normalized score across
  this account's own posts) — `null` if fewer than 8 posts were available
- `outlierItems` — the posts that cross that threshold, **already filtered
  and sorted by velocity descending**. Nothing left to calculate here.
- `scoreDistribution` (p25/p50/p75), `postingCadenceDays`,
  `mediaTypeDistribution`, `reelRatio`

If `outlierThreshold` is `null` (small sample), skip straight to sorting the
Step 2 posts by `intelligence.velocity` descending and take the top 5–8
instead of relying on `outlierItems`.

## Step 4 — Output

One table per account. If `outlierItems` is non-empty, use those directly
(they're already picked and sorted). Otherwise use the top 5–8 by velocity
from Step 2's full post list.

| Post | Type | Posted | Likes | Comments | Plays | Engagement Score | Velocity | Outlier? |
|---|---|---|---|---|---|---|---|---|

Note beneath the table: `reelRatio` from Step 3 tells you what fraction of
the account's posts are eligible for hook breakdown (`isVideo` +
`productType: "clips"`) — mention how many of the shortlisted posts are
images/carousels and therefore have nothing to transcribe.

## Step 5 — Hand off

Unless the user explicitly only wants the ranking, immediately continue:
pass the shortlisted Reels — each one already carries its `intelligence`
block (`engagementScore`, `velocity`, etc.) and a `videoUrl` — to
`ig-hook-breakdown`. It doesn't need to recompute anything from Step 2/3;
those numbers carry straight through into the swipe-file table. Don't wait
for confirmation — that's the point of the two-skill pipeline.
