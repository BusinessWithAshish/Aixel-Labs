# Content Lab API

Backend for the Content Lab module (PRD: `frontend/app/(protected)/content-lab/README.md`).
Finds posts that beat their creator's usual views across a niche, breaks one post
down, scores a draft against the niche's winners, and reads one creator.

Composes the YouTube and Instagram modules' fetch / service functions directly
(no HTTP loopback). No Mongo. The four services (`explore.ts`, `breakdown.ts`,
`check.ts`, `creator.ts`) are what an MCP `op` would call later.

## Routes

| Method | Route | Config key | Service |
|---|---|---|---|
| `POST` | `/content-lab/explore` | `API_ENDPOINTS.CONTENT_LAB.EXPLORE` | `contentLabExploreService` |
| `POST` | `/content-lab/breakdown` | `API_ENDPOINTS.CONTENT_LAB.BREAKDOWN` | `contentLabBreakdownService` |
| `POST` | `/content-lab/check` | `API_ENDPOINTS.CONTENT_LAB.CHECK` | `contentLabCheckService` |
| `POST` | `/content-lab/creator` | `API_ENDPOINTS.CONTENT_LAB.CREATOR` | `contentLabCreatorService` |

Request Zod: `schemas.ts`. Response types: `types.ts` (both fixed contract, FE
imports `@aixellabs/backend/content-lab/types` and `/constants`). Every route
answers `ALApiResponse<T>`; 400 invalid body / unsupported URL, 404 post or
creator not found, 502 upstream failure.

| Body | Response `data` |
|---|---|
| `{ query, platforms?: ["youtube","instagram"], country?: "IN", limit?: 24 }` | `CONTENT_LAB_EXPLORE_RESPONSE` |
| `{ url, country? }` | `CONTENT_LAB_BREAKDOWN_RESPONSE` |
| `{ text, platform, query, country? }` | `CONTENT_LAB_CHECK_RESPONSE` |
| `{ platform, handle, country?, limit?: 24 }` | `CONTENT_LAB_CREATOR_RESPONSE` |

## The multiple

`multiple = metric ÷ usualViews`, one decimal (`compute/baseline.ts`).

- **Metric**: views for long videos, Shorts and Reels (Reels: Reels-tab plays,
  else the embed page's view count); **likes** for Instagram carousels and photo
  posts, whose views Instagram hides. `views` is null on those.
- **usualViews**: the creator's median metric over their recent posts of the
  same format family (long video | Shorts + Reels | photo + carousel).
  YouTube: up to 30 uploads from the Videos and/or Shorts tab. Instagram: the
  latest grid page (12 posts; `creator` reads up to 3 pages).
- Fewer than `CONTENT_LAB_LIMITS.minBaselineUploads` (5) posts in the family →
  `usualViews` and `multiple` are null.
- Outlier = `multiple ≥ CONTENT_LAB_OUTLIER_MULTIPLE` (2).

## How each route works

**explore**: platforms run in parallel; one failing goes to `errors[platform]`.
- YouTube: raw search (30 results) → first 10 distinct channels → each channel's
  Videos / Shorts tab (only the tabs the hits' durations need, 4 channels at a
  time) + one `get_watch` per kept hit (likes, comments, exact date).
- Instagram: GSearch `/p/` + `/reel/` (`fetchInstagramAdvancedSearch`, no
  profile enrich) → hits interleaved by kind → first 10 distinct owners → each
  owner's grid page + profile (followers), 5 at a time, inside a 30 s budget;
  hits older than the grid page get their own post lookup (10 s budget).
  Owners still loading when a budget ends are dropped.
- Posts are sorted by multiple and cut to `limit`; `takeaways` and `niche` use
  every post found before the cut.

**breakdown**: YouTube watch / youtu.be / shorts URL, or Instagram `/p/`, `/reel/`, `/tv/`.
- YouTube: video details + transcript intelligence (hook = first sentences of the
  intro zone, type = `classifyHook`, seconds = intro length; zones → structure;
  first CTA + its % of the runtime) + comments intelligence (60 top comments:
  timestamp clusters → `rewatchedSeconds`, 5 most-liked) + the channel baseline.
  `text` = the transcript.
- Instagram: the post by shortcode (+ the owner's grid for baseline and plays).
  Hook = caption first line (`classifyHook`), structure = carousel slides, CTA =
  the caption sentence that asks (comment X / save / link in bio / follow / DM),
  `text` = the caption.

**check**: explore for that one platform (`limit` 12) → winners = posts at 2x or
more (else the top 3 by multiple) → `compute/check.ts`: each text signal that
≥ 25% of winners use weighs its prevalence, the draft earns the weight of those
it shares (75% of the score), plus length vs the winners' median (25%).

**creator**: YouTube `@handle`, `youtube.com/@handle`, `/channel/UC…` or a channel id;
Instagram handle or profile URL. Posts newest first with their multiple.

## Known limits (v1)

- **No Reel audio transcription**: Instagram hook/text come from the caption only;
  `hook.seconds`, `cta.atPercent` and structure timings are null on Instagram.
- **Instagram comments are login-only**: `audience` is empty on Instagram.
- YouTube without captions (many Shorts): hook, structure, CTA and `text` are null / empty.
- YouTube `comments` count is often null in explore (`get_watch` omits it; the deep
  lookup costs a full page per video).
- YouTube creator: dates of long videos are estimates from "3 weeks ago"; Shorts
  get exact dates (one `get_watch` each, up to `limit`), likes/comments only on Shorts.
- A 61-180 s video that is in neither tab's latest 30 counts as a long video.
- The baseline is the creator's recent posts; an old viral hit scores against
  today's usual (e.g. 200x).
- Instagram `durationSeconds` is always null (not in the guest post query).
- Search hits from creators past the 10-creator cap are dropped (no baseline).

## Layout

```
content-lab/
├── constants.ts schemas.ts types.ts   # contract (fixed) + internal limits
├── compute/        # pure: signals, baseline, reasons, takeaways, check, cta, time + selfcheck
├── helpers.ts      # post builder, deadlines, sorting
├── youtube.ts      # YouTube explore / creator / breakdown
├── instagram.ts    # Instagram explore / creator / breakdown
├── explore.ts breakdown.ts check.ts creator.ts   # services
├── handler.ts      # parse → service → ALApiResponse
└── index.ts        # router + service exports
```

## Tests

```bash
pnpm --filter @aixellabs/backend exec tsx src/api/content-lab/compute/selfcheck.ts
```

## Smoke

```bash
B=http://127.0.0.1:8013
curl -s -X POST $B/content-lab/explore -H 'content-type: application/json' \
  -d '{"query":"protein breakfast","country":"IN"}'
curl -s -X POST $B/content-lab/breakdown -H 'content-type: application/json' \
  -d '{"url":"https://www.youtube.com/watch?v=A-3-WbbmQP0"}'
curl -s -X POST $B/content-lab/breakdown -H 'content-type: application/json' \
  -d '{"url":"https://www.instagram.com/reel/DWA88DEE-1Q/"}'
curl -s -X POST $B/content-lab/check -H 'content-type: application/json' \
  -d '{"text":"My protein breakfast routine","platform":"youtube","query":"protein breakfast"}'
curl -s -X POST $B/content-lab/creator -H 'content-type: application/json' \
  -d '{"platform":"youtube","handle":"@doctors_kitchen"}'
curl -s -X POST $B/content-lab/creator -H 'content-type: application/json' \
  -d '{"platform":"instagram","handle":"@auraartofhealthyliving"}'
```

Measured 2026-10-27 from the VPS (`protein breakfast`, IN): explore both platforms
45 s (YouTube alone 15 s), breakdown 7-14 s, check 13 s (YouTube) / 42 s (Instagram),
creator 4-8 s (YouTube) / 11 s (Instagram).
