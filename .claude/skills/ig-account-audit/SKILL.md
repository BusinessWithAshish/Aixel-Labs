---
name: ig-account-audit
description: >-
  Use when asked to audit a single Instagram account, give it a growth
  score, or answer "how is this account doing / what should they fix."
  Produces a 7-category scored report (profile, content strategy, Reels
  performance, engagement quality, consistency, branding, monetization
  readiness) with strengths, weaknesses, and specific growth suggestions.
  Unlike ig-account-scout/ig-hook-breakdown (which rank and dissect
  individual posts across one or more accounts), this is a single-account,
  single-report tool — pull real numbers from the intelligence tools for
  every category that can be measured, and reserve judgment calls for the
  categories that genuinely can't be.
---

# IG Account Audit

Single-account scored audit. Adapted from a real, widely-used Claude Skill
format (Damini Tripathi's "Instagram Account Audit & Growth Score") — the
structure below is proven; what's new here is wiring four of the seven
categories to real computed numbers instead of the model eyeballing
screenshots. **Where a real number exists, use it and say so. Where it
doesn't, say "assumption" explicitly rather than presenting a guess as
data** — the original format already required this, keep it.

## Step 1 — Get the real numbers first

This is the same two-tool fetch `ig-account-scout` runs (Steps 2–3 there) —
if that skill already ran for this account earlier in the conversation,
reuse its output instead of re-fetching. Otherwise:

1. `instagram_get_account_intelligence(username, country, pages: 2)` — a
   slightly bigger sample than `ig-account-scout` uses (audit wants
   consistency signal, not just top performers).
2. `instagram_aggregate_account_signals(items: <posts from step 1>, username)`
3. If 3+ posts are video/Reels (check `reelRatio` and `mediaTypeDistribution`
   from step 2), pass the top 2–3 by `velocity` to `ig-hook-breakdown` for a
   real hook-quality read — don't eyeball hook strength from a caption alone
   when you can actually transcribe and score it.

If the account is private (`isPrivate: true`, empty `posts`), say so plainly
and score only what profile data supports (bio, follower/following ratio,
verified/business flags) — don't fabricate content-based scores.

## Step 2 — Score each category /10

**Weighted expert judgment, not a blind average of the seven.** State which
categories pulled the final score down or up.

1. **Profile Optimization** — username clarity, bio value proposition, CTA
   presence, link-in-bio effectiveness, highlights. Qualitative — no
   backend signal for this; read the profile fields (`bio`, `websites`,
   `businessCategoryName`) yourself.

2. **Content Strategy** — content mix and positioning. Ground this in
   `mediaTypeDistribution` from Step 1: what fraction is Reels vs. carousel
   vs. single image, and is that mix deliberate or accidental given the
   niche. Judge hook quality in captions/thumbnails qualitatively; judge hook
   quality in transcripts using `ig-hook-breakdown`'s output if you ran it.

3. **Reels Performance** — if you ran `ig-hook-breakdown` on the top
   outliers, use its actual hook-trigger classification and pass/fail tests
   instead of guessing. Cite `reelRatio` and the account's `velocity`
   distribution (from Step 1's aggregate) as the quantitative half of this
   score.

4. **Engagement Quality** — ground this directly in numbers: per-post
   `engagementRatio` (likes+comments ÷ followers) and
   `avgFollowerNormalizedScore` from Step 1's aggregate. A like-to-follower
   ratio and a distribution (`scoreDistribution.p25/p50/p75`) are real
   signals — cite the actual figures in the report, not "seems engaged."

5. **Consistency** — ground this in `postingCadenceDays` from Step 1's
   aggregate (average days between posts, computed from real timestamps).
   State the actual number ("posts roughly every 2.6 days") rather than "not
   consistent enough."

6. **Branding & Positioning** — niche clarity, target audience clarity, USP,
   visual identity. Qualitative — profile bio/highlights/content-mix
   inform this, but there's no formula for "clear positioning."

7. **Monetization Readiness** — funnel clarity, offer visibility, trust
   signals, authority positioning. Qualitative, informed by
   `isBusiness`/`businessCategoryName`/`websites` from the profile and
   whatever offer signals appear in captions/bio.

## Step 3 — Output format

```
🔎 Instagram Audit Report

Username:
Niche (Assumed or Clear):
Sample size: [N posts analyzed, over Y days — from Step 1]

📊 Section-wise Scores:
Profile Optimization: X/10
Content Strategy: X/10
Reels Performance: X/10
Engagement Quality: X/10 — [cite real engagementRatio / avgFollowerNormalizedScore]
Consistency: X/10 — [cite real postingCadenceDays]
Branding & Positioning: X/10
Monetization Readiness: X/10

⭐ Final Score: X/10 (weighted, not averaged — say what drove it)

✅ Strengths:
- ...

❌ Weaknesses:
- ...

🚀 Growth Suggestions (Actionable):
- Specific, tactical — hook rewrites, bio rewrite, content-mix shifts,
  posting-cadence targets tied to what a real velocity/engagement number
  actually supports, not generic "post more" advice.

🔥 Quick Wins (High Impact Fixes):
- 3–5 items
```

## Rules (carried over from the source format — still apply)

- No generic advice ("post consistently") — every suggestion ties to a
  specific number or a specific observed post.
- Be specific, tactical, and slightly critical where warranted. Growth
  consultant tone, not beginner-coach tone.
- If something is genuinely unmeasurable from available data, say
  "Based on limited data, this is an assumption..." — don't silently
  guess and present it as fact.

## Edge cases

- **New account** (few posts, `postingCadenceDays` null or very short
  history) — focus the report on setup and direction, not performance
  trends that don't exist yet.
- **Dead account** (`postingCadenceDays` very large, or most recent post
  old) — focus on revival strategy.
- **Viral/strong account** (`outlierItems` non-empty with high velocity,
  strong `avgFollowerNormalizedScore`) — focus on scaling and monetization
  rather than fundamentals.
