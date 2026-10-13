# Reddit API

Unauthenticated scrapers for public Reddit data — same idea as Twitter's guest
token and Instagram's public web endpoints. No Reddit account, no registered
OAuth app.

Reddit's logged-out web client sets an anonymous JWT cookie (`token_v2`) on any
`www.reddit.com` page. `oauth.reddit.com` accepts it as a Bearer for public
read endpoints and returns the full JSON API (Listings with ~107 fields per
post). That is the backbone of this module.

**Needs Evomi.** Reddit 403s datacenter IPs on every surface (including the
token mint). `withRedditSession` opens a sticky residential session per call.

**Two sources.** The six live ops read Reddit itself (ranked feeds, search
relevance, current scores) inside its rate limit. `/archive` reads the Arctic
Shift archive for volume and history — no Reddit request, no proxy.

## Endpoints

| Method | Route | Config key |
| ------ | ----- | ---------- |
| `POST` | `/reddit/feed` | `API_ENDPOINTS.REDDIT.FEED` |
| `POST` | `/reddit/post` | `API_ENDPOINTS.REDDIT.POST` |
| `POST` | `/reddit/subreddit` | `API_ENDPOINTS.REDDIT.SUBREDDIT` |
| `POST` | `/reddit/user` | `API_ENDPOINTS.REDDIT.USER` |
| `POST` | `/reddit/search` | `API_ENDPOINTS.REDDIT.SEARCH` |
| `POST` | `/reddit/wiki` | `API_ENDPOINTS.REDDIT.WIKI` |
| `POST` | `/reddit/archive` | `API_ENDPOINTS.REDDIT.ARCHIVE` |

Live bodies take optional `country` (ISO alpha-2, default `US`) for Evomi
routing; `/feed` on `popular` also sends it as `geo_filter`. Paged routes
return `after` — pass it back as `after` for the next page. `limit` defaults
to 100 (the max): Reddit counts one request per page whatever its size.

### Feed — `POST /reddit/feed`

```json
{ "subreddit": "programming", "sort": "top", "time": "week", "limit": 100 }
```

`subreddit` accepts `name`, `r/name`, or a URL; `popular` (default) and `all`
are the sitewide feeds. `sort`: `hot|new|top|rising|controversial`; `time`
only applies to `top`/`controversial`. `GET /r/{sub}/{sort}`.

### Post — `POST /reddit/post`

```json
{ "post": "https://www.reddit.com/r/AskReddit/comments/1g4z2qk/", "commentLimit": 200, "depth": 8 }
```

`post` is an ID, `t3_` fullname, post URL, `redd.it` link, or `/r/x/s/…`
share link (resolved by redirect). Returns `post`, `comments` (depth-first,
each with `depth` and `parentId`), and `more` — collapsed reply IDs Reddit did
not inline. `commentLimit: 0` returns the post only. `GET /comments/{id}`.

### Subreddit — `POST /reddit/subreddit`

```json
{ "subreddit": "programming", "includeRules": true }
```

Subscribers, active users, description, sidebar markdown, type, icons, and
rules. `GET /r/{sub}/about` + `/about/rules`.

### User — `POST /reddit/user`

```json
{ "username": "spez", "content": "submitted", "sort": "top", "time": "all", "limit": 25 }
```

Profile + karma, plus `content`: `overview` (posts and comments mixed, each
item tagged `kind`), `submitted`, or `comments`. Suspended users return the
profile with no items.

### Search — `POST /reddit/search`

```json
{ "query": "openai", "type": "post", "subreddit": "programming", "sort": "top", "time": "month" }
```

`type`: `post` (sitewide, or within `subreddit`), `subreddit`, or `user`.
NSFW results are dropped unless `includeNsfw: true`.

### Wiki — `POST /reddit/wiki`

```json
{ "subreddit": "programming", "page": "index" }
```

Page markdown plus last revision date/author.

### Archive — `POST /reddit/archive`

```json
{ "kind": "post", "subreddit": "SaaS", "query": "cold email", "after": "30d", "limit": 500 }
```

Bulk and historical posts or comments from
[Arctic Shift](https://github.com/ArthurHeitmann/arctic_shift), a community-run
archive (direct `fetch`, no Evomi, no token). Items have the same shape as the
live ops.

| Field | Notes |
| --- | --- |
| `kind` | `post` (default) or `comment` |
| `subreddit`, `author` | optional filters, same input forms as the live ops |
| `post` | `kind: comment` only — every comment under one post (flat; rebuild the tree from `parentId`) |
| `query` | keywords: title + text for posts, body for comments. Needs `subreddit` or `author` (or `post`) |
| `after`, `before` | creation-time bounds: ISO date/datetime, epoch seconds, or relative (`7d`, `3m`, `1year`) |
| `sort` | `desc` (default, newest first) or `asc` — creation time is the only order |
| `limit` | 1–1000, default 100. Fetched 100 at a time |
| `cursor` | the previous response's `next` |

Returns `{ kind, sort, items, next }`; `next` is `null` once the range is
exhausted. Paging is by `created_utc` and exclusive, so items sharing the exact
second of a page's last item can be skipped.

Things the archive does differently from live Reddit:

- **Near real-time, but counts lag.** New posts appear within seconds. `score`
  and `comments` are re-read about 36 h after creation; before that they are
  the value at ingest (often 0 or 1). `upvoteRatio` is the ingest value too.
- **No ranking.** No hot/top/relevance — use `/feed` or `/search` for that.
- **Comment `depth` is always 0.** Use `parentId`.
- **An unknown subreddit returns an empty list**, not 404.
- **Keyword queries are heavy.** One takes ~4 s and the archive then answers
  "slow down" for 15–25 s. The module waits and retries (up to ~30 s), then
  returns 429. A narrower `after`/`before` range is cheaper. A multi-page call
  that gets limited part-way returns the pages it has, with `next`.
- **No guarantees.** Free service, no SLA, no published terms; the author asks
  users to be considerate and to use the monthly dumps for whole-site bulk.

## Errors

| Status | When |
| --- | --- |
| `400` | Bad body, or a subreddit/user/post that does not parse |
| `403` | Private / quarantined / banned subreddit (reason in message), or Reddit blocked the exit IP |
| `404` | Missing subreddit, user, post, or wiki page |
| `429` | Rate limit (Reddit or the archive) after waiting — message carries `retry in Ns` |
| `502` | Any other upstream failure |

## Network sources (logged-out)

Captured with an incognito Chrome through Evomi against the home page, a
subreddit, top/week, a post, a user, search, popular, and a wiki page.

| Call | Auth | Used for |
| --- | --- | --- |
| `GET https://www.reddit.com/` | none | sets `token_v2` (anonymous JWT) |
| `GET https://oauth.reddit.com/r/{sub}/{sort}` | Bearer `token_v2` | `/feed` |
| `GET https://oauth.reddit.com/comments/{id}` | Bearer | `/post` |
| `GET https://oauth.reddit.com/r/{sub}/about[/rules]` | Bearer | `/subreddit` |
| `GET https://oauth.reddit.com/user/{name}/about|overview|submitted|comments` | Bearer | `/user` |
| `GET https://oauth.reddit.com/search`, `/r/{sub}/search`, `/subreddits/search`, `/users/search` | Bearer | `/search` |
| `GET https://oauth.reddit.com/r/{sub}/wiki/{page}` | Bearer | `/wiki` |

**Measured (TLS client + Evomi, no browser):** subreddit hot 25 posts = 77 KB,
search 25 posts = 123 KB, both 200. The token mint is the expensive call
(~500 KB home page) and is cached in-process until the JWT `exp`.

**Not used:**

- `www.reddit.com/*.json` — 403 even on residential IPs.
- `old.reddit.com/*.json` — 200 but serves an HTML interstitial.
- `/svc/shreddit/*` (`community-more-posts`, `feeds/popular-feed`, `search`,
  `profiles/…`) — the web client's own HTML partials. They work but are 4–8×
  heavier and need markup parsing.
- `/svc/shreddit/graphql` — logged-out it only carries captcha / experiment
  ops, no content.

On a 401 (or a 403 without a `reason`) the token is re-minted once in the same
proxy session and the call retried. A proxy tunnel failure (status 0) reruns
the call on a fresh Evomi exit, up to `REDDIT_SESSION_ATTEMPTS`.

`/archive` calls `GET https://arctic-shift.photon-reddit.com/api/posts/search`
and `/api/comments/search`.

## Rate limit, pacing, cache

Measured 2026-10-13 on the anonymous token (headers arrive as
`X-Ratelimit-Remaining` / `-Reset` / `-Used` and `Retry-After`):

- **100 requests per ~5 minute window.**
- **A short limiter on top**: a 429 with `Retry-After` of 1–7 s roughly every
  5–10 requests, at any spacing from 0.7 s to 2 s. A 429 still spends one of
  the 100.

`redditGet` stays inside that; it does not rotate tokens or IPs.

- **Pacing.** Every request reserves a start slot at least
  `REDDIT_MIN_REQUEST_GAP_MS` (1 s) after the previous one, process-wide, so
  concurrent calls queue instead of bursting.
- **429.** Waits out `Retry-After` and retries, up to
  `REDDIT_RATE_LIMIT_RETRIES` (4). When the window is spent, slots are held
  until `X-Ratelimit-Reset`.
- **Give up.** A call that would wait longer than `REDDIT_MAX_QUEUE_WAIT_MS`
  (30 s) fails with HTTP 429 and `retry in Ns`.
- **Cache.** Identical inputs share one result (and one in-flight request) for
  `REDDIT_CACHE_TTL_MS`: feed/post 1 min, user/search/archive 2 min,
  subreddit/wiki 10 min. In-process, 500 entries, errors not cached.

Throughput: 12 concurrent 100-post feeds returned 1,200 posts in ~21 s; the
ceiling is ~100 pages (10,000 posts) per 5 minutes. Each HTTP call costs 1
request (`/subreddit` with rules and `/user` cost 2; an empty `/feed` first
page costs 2 to tell "empty" from "missing"). For more than that, or for
history, use `/archive`.

## Layout

```
reddit/
  index.ts / handlers.ts / create-handler.ts / client.ts
  archive.ts          # Arctic Shift search (posts/comments), paging, retries
  helpers.ts          # Evomi session, token_v2 mint, pacing, cache, oauth GET
  compute.ts          # input parsing, Listing → post/comment/sub/user mappers
  schemas.ts / types.ts / constants.ts
  README.md
```

## MCP

Same fetchers, no HTTP loopback, on `/mcp` (`aixel-intelligence`) via the
`reddit` domain tool: `op` = `feed` | `post` | `subreddit` | `user` |
`search` | `wiki` | `archive`. Raw only — no Reddit intelligence overlay.
