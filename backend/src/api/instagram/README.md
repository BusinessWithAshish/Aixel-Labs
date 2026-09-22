# Instagram lead API

Browserless Instagram profile lookup + discovery via Google CSE (`gsearch`).

## Endpoints

`POST /instagram` — look up profiles by username/URL (`entities`) and/or discover
handles via Google advanced search (`query` + optional keywords/hashtags).

`POST /instagram/advanced/posts` — public profile **Posts** tab (grid + scroll).
See [`advanced/README.md`](./advanced/README.md).

`POST /instagram/advanced/search` — **content search → leads**: GSearch for
`/p/` + `/reel/` URLs, resolve owners with the logged-out post query, return
handles (+ optional profile enrich). See [`advanced/search/README.md`](./advanced/search/README.md).

`POST /instagram/download` — save public post / reel / carousel media to local
disk (Googlebot-UA SSR page, direct — no proxy). See
[`download/README.md`](./download/README.md).

## How discovery works

1. `generateInstagramSearchQuery` builds a profile-biased Google query:
   `site:instagram.com intitle:"Instagram photos and videos" …`
2. `fetchGsearch` returns SERP URLs (up to ~120).
3. `extractUsername` / `uniqueUsernames` keep profile handles only.
4. `fetchFromEntities` runs the logged-out profile query per handle (4 at a
   time) and reads the post count off the profile embed page.

## Transport — logged-out GraphQL (`graphql.ts`)

Since Sep 2026 Instagram answers every guest call to `web_profile_info` and
`/api/v1/feed/user/…` with `401 require_login` — from this VPS, from Evomi, and
from a real Chrome with a primed session — and redirects profile HTML on the
VPS's datacenter IP to the login page. What still works is what a logged-out
browser uses: persisted Relay queries on `POST /api/graphql`
(`IG_LOGGED_OUT_QUERIES` in `constants.ts`).

| Query | Variables | Gives |
| ----- | --------- | ----- |
| `profile` | `username` | bio, links, follower/following counts, verified, private |
| `posts` | `username, first, after?` | Posts-tab grid (12 per call max) + cursor |
| `reels` | `username, first, after?` | reel `play_count` / likes / comments |
| `media` | `media_id` | one post: likes, comments, `taken_at`, media URLs, carousel |
| `profilePage` | `id` + provider flags | `account_type`, public `category`, HD picture — the logged-in profile page query, which still answers guests |

- No cookies or priming: any `lsd` value, sent as form field **and**
  `x-fb-lsd` header, is accepted. Calls go **direct** from the VPS first (the
  GraphQL endpoint isn't behind the profile-page rate limit), Evomi only as a
  fallback.
- Doc ids rotate with Instagram builds. A stale one answers "The GraphQL
  document with ID … was not found"; `graphql.ts` then re-reads the ids from
  the pages' `expectedPreloaders` (profile pages via Evomi, a post page direct)
  and retries once. `profilePage` is preloaded nowhere logged-out, so its id is
  looked up in those pages' JS bundles (`{name}_instagramRelayOperation`,
  ~50 MB direct from the static CDN, at most once per 6 h).
- Where each profile field comes from: `isBusiness` / `isProfessional` ←
  `account_type` (1 personal, 2 business, 3 creator — the query's own
  `is_business` is always false to guests); `businessCategoryName` ← the
  category the account shows publicly; `profilePictureHd` ←
  `hd_profile_pic_url_info`; `posts` (count) ← `/{username}/embed/`;
  `businessEmail` / `businessPhoneNumber` ← the bio plus WhatsApp / `tel:` /
  `mailto:` bio links. Post `viewCount` on videos ← `/p/{code}/embed/`
  (`video_view_count`). Embed pages 500 about one fetch in four; reads retry.
- Login-only, so always `null`: the Contact-button email/phone,
  `businessAddressJson` (the page query nulls `address_*` for guests — 0 of 33
  businesses tested), `overallCategoryName`, `isJoinedRecently` ("About this
  account" is a logged-in Bloks app), photo view counts.

## Architecture

```
instagram/
├── index.ts          # Router + public exports
├── constants.ts      # URLs, operators, limits, reserved paths, errors, headers
├── schemas.ts        # INSTAGRAM_REQUEST_SCHEMA
├── types.ts          # INSTAGRAM_REQUEST / RESPONSE + raw IG Graph types
├── compute/
│   ├── query.ts      # generateInstagramSearchQuery + OR/exclude helpers
│   ├── username.ts   # extractUsername, uniqueUsernames, hasQuery/hasEntities
│   ├── phones.ts     # bio/business phone extraction
│   ├── xig-user.ts   # xig_user_by_username → INSTAGRAM_RESPONSE
│   └── index.ts
├── graphql.ts        # logged-out /api/graphql transport + doc id rediscovery
├── client.ts         # fetchFromEntities / fetchFromQuery (I/O)
├── helpers.ts        # barrel re-export of compute + client
└── handler.ts        # Express handler
```

### DRY map

| Concern                         | Location              |
| ------------------------------- | --------------------- |
| Site host, GSearch operators    | `constants.ts`        |
| Reserved path segments          | `constants.ts`        |
| Error / handler strings         | `constants.ts`        |
| Query builders                  | `compute/query.ts`    |
| Handle extraction               | `compute/username.ts` |
| Phone parsing                   | `compute/phones.ts`   |
| Response mapping                | `compute/xig-user.ts` |
| Logged-out GraphQL transport    | `graphql.ts`          |
| TLS + GSearch orchestration     | `client.ts`           |
| Express handler                 | `handler.ts`          |

## Checklist — adding a field

1. Extend `INSTAGRAM_RESPONSE` in `types.ts` (and `XigUserByUsername` in
   `compute/xig-user.ts` if the profile query carries the raw field).
2. Map it in `compute/xig-user.ts`.
3. Do not put string literals for reused URLs/paths in compute or client —
   add them to `constants.ts` first.
