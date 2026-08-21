# Twitter / X API

Unauthenticated scrapers for public X data — same idea as YouTube InnerTube
and Instagram's public web endpoints. Guest token + web bearer; no user login.

Native keyword search (`SearchTimeline`) and `/search` pages are **login-walled**.
`/twitter/search` follows the Instagram advanced-search pattern: GSearch
`site:x.com` → hydrate via GraphQL / syndication.

## Endpoints

| Method | Route | Config key |
| ------ | ----- | ---------- |
| `POST` | `/twitter/user` | `API_ENDPOINTS.TWITTER.USER` |
| `POST` | `/twitter/tweet` | `API_ENDPOINTS.TWITTER.TWEET` |
| `POST` | `/twitter/tweets` | `API_ENDPOINTS.TWITTER.TWEETS` |
| `POST` | `/twitter/trending` | `API_ENDPOINTS.TWITTER.TRENDING` |
| `POST` | `/twitter/search` | `API_ENDPOINTS.TWITTER.SEARCH` |

## Request / response

All bodies include optional `country` (real ISO 3166-1 alpha-2, default `US`)
for Evomi proxy routing and trending WOEID. Invalid codes (e.g. `ZZ`) are
rejected. Valid ISO codes missing from the WOEID table still open a guest
session in that country; trending uses worldwide (`woeid=1`). Direct callers
that skip Zod and pass a non-ISO code are remapped to `US` for Evomi.

### User — `POST /twitter/user`

```json
{ "username": "NASA" }
```

`username` accepts `@NASA`, `NASA`, or `https://x.com/NASA`. Bare site-section
names (`explore`, `search`, …) are rejected the same way as `/explore` URLs.

GraphQL `UserByScreenName` (guest).

### Tweet — `POST /twitter/tweet`

```json
{ "tweet": "20", "includeRelated": false }
```

`tweet` is a snowflake ID or status URL. GraphQL `TweetResultByRestId`, with
`cdn.syndication.twimg.com/tweet-result` as fallback. `includeRelated` pulls
recent posts from the same author (`UserTweets`) — native SimilarPosts is
guest-404.

### Tweets — `POST /twitter/tweets`

```json
{ "username": "NASA", "limit": 20, "cursor": null }
```

GraphQL `UserTweets`. `cursor` is the previous `data.cursor`.

### Trending — `POST /twitter/trending`

```json
{ "country": "US", "limit": 20 }
```

REST `GET /1.1/trends/place.json?id={woeid}` (guest). Valid ISO countries that
are not in the WOEID table fall back to worldwide (`woeid=1`). Direct callers
that skip Zod still must not send a non-ISO `country` to Evomi — guest
sessions remap those to `US` so the worldwide path can run.

### Search — `POST /twitter/search`

```json
{ "query": "openai", "filter": "tweet", "limit": 10, "pages": 1 }
```

`filter`: `tweet` | `user`. Requires Evomi (GSearch). Tweet discovery uses
`site:x.com inurl:/status/` (not `site:x.com/status`, which only matches a
root `/status` path that X does not use). Hydrates tweet IDs / handles
through the same GraphQL paths as `/tweet` and `/user`. User search also
hydrates handles parsed out of status URLs.

## Network sources (logged-out)

Captured against `https://x.com/explore` (login wall) and `https://x.com/NASA`
(public profile, no login):

| Call | Auth | Used for |
| --- | --- | --- |
| `POST https://api.twitter.com/1.1/guest/activate.json` | web bearer | guest token |
| `GET https://api.x.com/graphql/{queryId}/UserByScreenName` | bearer + `x-guest-token` | `/user` |
| `GET https://api.x.com/graphql/{queryId}/TweetResultByRestId` | guest | `/tweet` |
| `GET https://api.x.com/graphql/{queryId}/UserTweets` | guest | `/tweets`, related |
| `GET https://api.twitter.com/1.1/trends/place.json` | guest | `/trending` |
| `GET https://cdn.syndication.twimg.com/tweet-result` | none (embed token) | tweet fallback |
| `GET https://abs.twimg.com/responsive-web/client-web/main.*.js` | none | queryId refresh on GraphQL 404 |

**Guest-404 (not wired):** `SearchTimeline`, `TweetDetail`, `ExplorePage`,
`SimilarPosts`, `1.1/search/typeahead.json`.

Query IDs live in `constants.ts` (`TWITTER_FALLBACK_OPERATIONS`) and are
rescraped from `main.*.js` after a GraphQL 404.

## Layout

```
twitter/
  index.ts / handlers.ts / create-handler.ts / client.ts
  helpers.ts          # guest token, GraphQL GET, queryId cache
  compute.ts          # URL parse, user/tweet/trend mappers
  schemas.ts / types.ts / constants.ts
  README.md
```

## Smoke

```bash
cd backend && pnpm exec tsx scripts/twitter-smoke.ts
```

## MCP

Same fetchers, no HTTP loopback, on `/mcp` (`aixel-intelligence`) via the
`twitter` domain tool: `op` = `user` | `tweet` | `user_tweets` | `trending` |
`search`. Raw only — no Twitter intelligence API.
