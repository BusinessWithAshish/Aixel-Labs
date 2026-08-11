---
name: ig-hook-breakdown
description: >-
  Use when given specific Instagram Reels/posts — from ig-account-scout's
  shortlist, or direct reel/video URLs — and asked to break down their hooks,
  retention mechanics, or script structure, or to build a swipe file / "style
  DNA" for content research and idea generation. Transcribes each reel,
  extracts and classifies the hook, maps retention mechanisms and script
  structure, then synthesizes cross-reel patterns into a swipe file and new
  hook ideas for the user's own content.
---

# IG Hook Breakdown

Content-analysis stage. Input: a list of Reels — each needs at minimum a
direct `videoUrl` (CDN file URL, not an instagram.com page URL) plus
`caption`, `likeCount`, `commentCount`, `playCount`, `takenAt`. This is
exactly the shape `ig-account-scout` hands off. If you only have an
instagram.com/reel/... URL, resolve it to a `videoUrl` via
`instagram_get_account_intelligence` first — `transcription_transcribe_media`
needs a direct file URL, not a webpage.

If the reel came from `ig-account-scout`, it already carries an
`intelligence` block (`engagementScore`, `followerNormalizedScore`,
`velocity`, `engagementRatio`) computed server-side — carry those numbers
straight into the Step 4 swipe-file row, don't recompute them here. This
skill's job is judgment (hook quality, retention, structure), not
arithmetic.

The rubric this skill applies is in `references/hook-taxonomy.md` — read it
before Step 3 the first time; it's the actual scoring/classification logic,
kept out of this file to keep the workflow scannable.

## Step 1 — Transcribe

`transcription_transcribe_media(blobUrl: videoUrl, format: "json")`. Use
`format: "json"` (not the default `txt`) — you need Groq's segment
timestamps to isolate the hook zone in Step 2. This transcribes via Whisper
server-side; it does not read on-screen text/burned-in captions or visuals —
note that as a limitation when a reel is clearly visual-hook-driven (e.g. a
text-on-screen meme format) rather than voice-driven.

## Step 2 — Isolate the hook zone

Hook zone = every transcript segment whose start time falls within the first
5 seconds. Separately note the caption's first line/sentence — captions
often carry their own "text hook" independent of the spoken one.

If the hook zone has no speech (silent open, music-only, pure on-screen
text), say so explicitly rather than fabricating a spoken hook — score what's
actually analyzable (caption + timing) and flag the gap.

## Step 3 — Per-reel breakdown

Using `references/hook-taxonomy.md`, for each reel produce:

1. **Hook trigger classification** — which of the 10 psychological triggers
   the hook uses (curiosity, loss frame, contrast, specificity, controversy,
   pattern interrupt, identity, social proof, future pace, simplicity).
2. **Hook tests** — does it pass (a) the fear-of-loss/curiosity/identity-
   relevance test, (b) the pattern-interrupt test ("why would this specific
   opening stop a scroll?"), (c) the stranger test ("would this make sense
   with zero context, in 3 seconds?"). Fail on any = flag as a weak hook.
3. **Retention mechanisms present** — open loops, delayed payoff,
   micro-escalations (roughly every 3–5s), pattern interrupts mid-video,
   forward momentum. List which appear, with rough timestamps.
4. **Script structure** — map the transcript onto Hook → Problem →
   Agitation → Solution → Proof → Offer → CTA. Note which stages are present
   vs. skipped; not every reel needs all seven.
5. **Reward type** — Education (clarity/information), Entertainment
   (emotional release), or Inspiration (self-belief/action).
6. **Caption/CTA/hashtag pattern** — from the `caption` field: is there an
   explicit CTA (comment/save/follow/link), how many hashtags, where do they
   sit (inline vs. trailing block).

## Step 4 — Swipe-file row per reel

One row per analyzed reel. `Velocity` and `Engagement score` come straight
from the incoming `intelligence` block (Step 2/3 of `ig-account-scout`) —
don't recalculate them:

| Reel | Velocity | Engagement score | Hook text | Hook trigger | Tests passed | Retention mechanisms | Script stages present | Reward type | CTA |
|---|---|---|---|---|---|---|---|---|---|

## Step 5 — Cross-reel synthesis (3+ reels from the same account)

Build a **style DNA** summary — see the checklist in
`references/hook-taxonomy.md`. The instruction that matters most here:
**extract HOW the account's content works, don't summarize WHAT it's
about.** Niche and topic are not style; sentence rhythm, hook pattern
frequency, average words-per-second, and recurring retention techniques are.

## Step 6 — New hook ideas

Generate 3–5 new hook options for the user's own topic/niche, applying the
Hook Forge constraints in the reference file (no "I"/"Are you" openers, no
question-mark endings, one or two short sentences, each a genuinely
different trigger). End with a self-ranked pick and a one-line reason.

**Hard rule: match style, not wording.** These are new hooks inspired by the
extracted pattern — never lightly reworded copies of a source creator's
actual hook. If a generated hook is too close to a specific source line,
regenerate it.

## Output

Swipe-file table (Step 4) → style DNA summary (Step 5) → new hook ideas
(Step 6). If fewer than 3 reels were analyzed, skip Step 5 and say why
(sample too small for a style pattern) rather than overgeneralizing from
one or two data points.
