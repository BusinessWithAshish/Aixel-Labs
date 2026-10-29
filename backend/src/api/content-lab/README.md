# Content Lab API

Backend for the Content Lab module (PRD: `frontend/app/(protected)/content-lab/README.md`).
Finds posts that beat their creator's usual views across a niche, breaks one post
down, scores a draft against the niche's winners, and reads one creator.

Composes the YouTube and Instagram modules' fetch / service functions directly
(no HTTP loopback). No Mongo. The five services (`explore.ts`, `breakdown.ts`,
`check.ts`, `creator.ts`, `suggest.ts`) are what an MCP `op` would call later.

## Routes

| Method | Route | Config key | Service |
|---|---|---|---|
| `POST` | `/content-lab/explore` | `API_ENDPOINTS.CONTENT_LAB.EXPLORE` | `contentLabExploreService` |
| `POST` | `/content-lab/breakdown` | `API_ENDPOINTS.CONTENT_LAB.BREAKDOWN` | `contentLabBreakdownService` |
| `POST` | `/content-lab/check` | `API_ENDPOINTS.CONTENT_LAB.CHECK` | `contentLabCheckService` |
| `POST` | `/content-lab/creator` | `API_ENDPOINTS.CONTENT_LAB.CREATOR` | `contentLabCreatorService` |
| `POST` | `/content-lab/suggest` | `API_ENDPOINTS.CONTENT_LAB.SUGGEST` | `contentLabSuggestService` |

Request Zod: `schemas.ts`. Response types: `types.ts` (both fixed contract, FE
imports `@aixellabs/backend/content-lab/types` and `/constants`). Every route
answers `ALApiResponse<T>`; 400 invalid body / unsupported URL / a cursor from
another search, 404 post or creator not found, 502 upstream failure.

| Body | Response `data` |
|---|---|
| `{ query, platforms?: ["youtube","instagram"], country?: "IN", limit?: 24, cursor? }` | `CONTENT_LAB_EXPLORE_RESPONSE` |
| `{ url, country? }` | `CONTENT_LAB_BREAKDOWN_RESPONSE` |
| `{ text, platform, query, country? }` | `CONTENT_LAB_CHECK_RESPONSE` |
| `{ platform, handle, country?, limit?: 24 }` | `CONTENT_LAB_CREATOR_RESPONSE` |
| `{ platform, query, country? }` | `CONTENT_LAB_SUGGEST_RESPONSE` |

## Words in the UI

Reasons, takeaways, "why it worked" and check details are plain English for
creators: "6 times their usual views", "Got 6 times more views than this
creator usually gets", "4 of the 5 top posts put a number in the title",
"Try: a list". No "multiple", "median", "baseline", "outlier", "winners" or
"2x"; `selfcheck.ts` fails if one slips back in. The field names (`multiple`,
`usualViews`) stay as they are; only the text changed.

## The multiple

`multiple = metric ÷ usualViews`, one decimal (`compute/baseline.ts`).

- **Metric**: views for long videos, Shorts and Reels (Reels: Reels-tab plays,
  else the embed page's view count); **likes** for Instagram carousels and photo
  posts, whose views Instagram hides. `views` is null on those.
- **usualViews**: the creator's median metric over their recent posts of the
  same format family (long video | Shorts + Reels | photo + carousel).
  YouTube: up to 30 uploads from the Videos and/or Shorts tab. Instagram
  explore: plays of the newest 12 reels (Reels tab), and for photo posts the
  likes of up to 8 photo posts on the latest grid page; `creator` and
  `breakdown`: the latest grid page (12 posts; `creator` reads up to 3 pages).
- Fewer than `CONTENT_LAB_LIMITS.minBaselineUploads` (5) posts in the family →
  `usualViews` and `multiple` are null.
- Outlier = `multiple ≥ CONTENT_LAB_OUTLIER_MULTIPLE` (2).

## How each route works

**explore**: one page per call; platforms run in parallel; one failing goes to
`errors[platform]` (and that platform stops paging). A slow page doesn't
stop paging: when Instagram returns nothing because it was late
(`errors.instagram`: "Instagram is slow right now…") or every YouTube search
batch failed (`errors.youtube`), what was late is carried or retried on the
next page. Posts older than
`CONTENT_LAB_MAX_AGE_DAYS` (400: "2 years ago" and older) are left out.
- YouTube (`exploreYoutube`): three search streams (`CONTENT_LAB_YOUTUBE_STREAMS`,
  `sp` values in `youtube/constants.ts` → `YOUTUBE_SEARCH_SORT_SP`): most-viewed
  uploads **this month**, most-viewed **this year**, and relevance. Each reads
  one batch (~20) per page through InnerTube `POST /search` (~0.5 s, no HTML)
  and keeps its continuation token. Hits are taken from the streams in turn,
  skipping seen / repeated / too-old videos, until one more new channel would
  pass `maxCreatorsPerPlatform` (12); that stream stops at that hit and the
  next page starts there, so no hit is skipped. Each hit channel's Videos /
  Shorts tab (8 at a time, 15 s budget, cached 20 min) gives the baseline,
  and up to 3 of the channel's **own recent uploads on the topic** (half the
  topic words in the title) that beat their usual join as extra posts.
  Likes, comments, exact date and length (`get_watch`) load only for
  YouTube's top `limit`, while Instagram is still running (5 s budget).
- Instagram (`exploreInstagram`): GSearch searches from
  `CONTENT_LAB_INSTAGRAM_SEARCHES`, in parallel (proxied, 4-16 s each
  depending on load: once the first returns the rest get 4 s more, 12 s at
  most; a search still running then counts as empty). The lookups after
  them get 12 s. Page 1: the topic's reels
  this month, reels this year, posts this year. Later pages, 2 at a time:
  reels for the 3 biggest **related hashtags** (Instagram's guest tag search,
  `searchInstagramHashtags`, looked up during page 1), then `{topic} viral`
  reels and posts with no date limit. Shortcodes are dated from their media
  id (no request) so old and seen hits drop before any lookup. Then,
  pipelined: the first 36 hits' post queries (owner, caption, likes, date; 10
  at a time, stopping 4 s before the deadline) → each owner's fetch starts as
  soon as their first hit resolves (first 12 new owners; profile + Reels tab +
  Posts tab, ~1.5 s, 8 at a time, cached 20 min) → plays from the owner's
  Reels tab. A reel older than its owner's newest 12 uses its embed page's
  view count instead (read alongside the owner, 2 tries); with neither it is
  left out. Up to 3 of each owner's newest reels on the topic that beat their
  usual join too.
- **Ranking** (`compute/rank.ts`): score = 0.40 × how far it beat the
  creator's usual (log scale, 0.5x → 0, 32x → 1; no baseline counts as 1x) +
  0.35 × volume (log scale, 1k → 0, 10M views → 1; photo posts use likes × 25)
  + 0.25 × recency (halves every 60 days; undated = 180 days old). Posts under
  5,000 views/plays (100 likes for photo posts) go after every post that
  clears that floor. With both platforms, each keeps at least 35% of the page
  when it has that many posts over the floor (`takeWithPlatformShare`); rank
  order is kept.
- **Paging**: send `nextCursor` back as `cursor` with the same query and
  country (another search's cursor → 400). The cursor is base64url of
  raw-deflated JSON (`cursor.ts`): each YouTube stream's token + offset (+
  failed tries), the next Instagram search, searches to retry and the related
  hashtags, a 32-bit hash of every post id already returned (last 400), so a
  post never comes back, and the **carried** posts.
- **Nothing found is lost to paging** (`CONTENT_LAB_CARRY`): a post read but
  not returned (cut by `limit` or the platform share, YouTube beyond its top
  `limit`, a hit whose channel / owner / post lookup / embed count was still
  loading at the deadline, Instagram hits past the 36-per-page or 12-owner
  caps) is carried in the cursor and comes first next page: YouTube as a
  compact hit (id, channel, title, views, length, date), Instagram as its
  shortcode. Each is carried 3 times at most. With a page's worth carried
  (YouTube `limit`, Instagram 36), that platform reads no new search that
  page. A YouTube batch that fails is retried next page (3 times in a row at
  most, then the stream ends); an Instagram search that fails or is too slow
  is retried once next page. Posts that are gone (deleted, private, owner
  lookup failed, no view count) are dropped. Late owners, channels and
  searches keep loading in the background into the caches, so the retry is
  usually instant.
- A platform's state turns null when its searches run out and nothing is
  carried; `nextCursor` is null when all asked-for platforms are done. About
  1-4 KB; if it would pass `maxCursorChars` (12,000), the lowest-ranked
  carried posts go first, then the oldest seen ids.
- **Page 1** returns `takeaways` and `niche` over every post it found, before
  the cut. **Later pages** return `takeaways: []` and `niche` for that page's
  posts only; keep page 1's.

**suggest**: creator type-ahead, cached 10 min per platform + country + text.
- YouTube: channel search (one InnerTube `POST /search` with the channel
  filter, ~0.5 s) → handle (from the channel URL), name, avatar, subscribers,
  verified.
- Instagram: no guest user search exists (`/web/search/topsearch`,
  `/api/v1/users/search` → 404 / login, checked 2026-10-28), and GSearch takes
  4-7 s. So it looks up the handles the text could be, in parallel: as typed,
  and for several words joined plain / with "." / with "_" (profile query,
  direct). Exact handles only: a display name like "Ranveer Singh" finds
  `@ranveersingh` only if that handle exists.

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
`creator.avatarUrl` / `bio`: YouTube channel avatar + description (from the
tab fetch); Instagram HD profile picture + bio (from the profile lookup).
Explore posts carry them too where the data is at hand (YouTube channel tabs,
Instagram profile query).

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
- A post carried 3 times without making a page is dropped (usually one under
  the view floor), and so is an Instagram search that failed twice.
- Instagram has no guest keyword, hashtag-page or user search; discovery is
  GSearch (`site:instagram.com/reel …`) plus the guest tag search for related
  hashtag names. Hashtag pages themselves redirect to login.
- In-memory caches (creator tabs / grids 20 min, suggest 10 min) are per
  process: a restart or a deploy slot switch starts them cold.

## Layout

```
content-lab/
├── constants.ts schemas.ts types.ts   # contract (fixed) + internal limits
├── compute/        # pure: signals, baseline, rank, topic, reasons, takeaways, check, cta, time + selfcheck
├── helpers.ts      # post builder, deadlines, sorting
├── cursor.ts       # explore paging state ↔ opaque cursor
├── cache.ts        # in-process TTL cache (creator tabs, suggest)
├── youtube.ts      # YouTube explore / suggest / creator / breakdown
├── instagram.ts    # Instagram explore / suggest / creator / breakdown
├── explore.ts breakdown.ts check.ts creator.ts suggest.ts   # services
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
curl -s -X POST $B/content-lab/suggest -H 'content-type: application/json' \
  -d '{"platform":"youtube","query":"ranveer"}'
# Page 2: send the previous page's nextCursor back with the same query + country.
curl -s -X POST $B/content-lab/explore -H 'content-type: application/json' \
  -d '{"query":"protein breakfast","country":"IN","cursor":"<nextCursor>"}'
```

Measured 2026-10-27 from the VPS (`protein breakfast`, IN): breakdown 7-14 s,
check 13 s (YouTube) / 42 s (Instagram), creator 4-8 s (YouTube) / 11 s (Instagram).

Explore, measured 2026-10-28 from the VPS under heavy load (both platforms,
24 posts a page):

| | Before (one search, sorted by multiple) | After |
|---|---|---|
| Page 1 | 40-46 s | 13-23 s (YouTube alone 12-17 s) |
| Pages 2, 3 | none | 14-24 s each |
| Top-12 median views | 1.3M (IN topics), 7.3M (US), mostly 2019-2024 uploads | 0.8-1.2M, every post ≤ 1 year old, most ≤ 3 months |
| Repeats across pages | n/a | 0 |

Instagram's share swings with load: 6-8 posts a page when its guest GraphQL
answers in ~0.5 s, 0-3 when a call takes ~5 s. Suggest: YouTube ~0.5 s,
Instagram 0.15-0.35 s, cached repeats < 10 ms.
