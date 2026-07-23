# Instagram lead API

Browserless Instagram profile lookup + discovery via Google CSE (`gsearch`).

## Endpoints

`POST /instagram` — look up profiles by username/URL (`entities`) and/or discover
handles via Google advanced search (`query` + optional keywords/hashtags).

`POST /instagram/advanced/posts` — public profile **Posts** tab (grid + scroll).
See [`advanced/README.md`](./advanced/README.md).

`POST /instagram/advanced/search` — **content search → leads**: GSearch for
`/p/` + `/reel/` URLs, resolve owners from `og:url`, return handles (+ optional
profile enrich). See [`advanced/search/README.md`](./advanced/search/README.md).

`POST /instagram/advanced/popular` — **native IG topic search (no GSearch)**:
`/popular/{query}/` public reels grid → handles. See
[`advanced/popular/README.md`](./advanced/popular/README.md).

## How discovery works

1. `generateInstagramSearchQuery` builds a profile-biased Google query:
   `site:instagram.com intitle:"Instagram photos and videos" …`
2. `fetchGsearch` returns SERP URLs (up to ~120).
3. `extractUsername` / `uniqueUsernames` keep profile handles only.
4. `fetchUrls` hits Instagram `web_profile_info` per handle (proxied).

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
│   ├── map-response.ts # InstagramUser → INSTAGRAM_RESPONSE
│   └── index.ts
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
| Response mapping                | `compute/map-response.ts` |
| TLS + GSearch orchestration     | `client.ts`           |
| Express handler                 | `handler.ts`          |

## Checklist — adding a field

1. Extend raw `InstagramUser` / `INSTAGRAM_RESPONSE` in `types.ts`.
2. Map it in `compute/map-response.ts`.
3. Do not put string literals for reused URLs/paths in compute or client —
   add them to `constants.ts` first.
