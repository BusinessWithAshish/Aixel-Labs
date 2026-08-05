# Instagram Advanced API

Public Instagram enrichment beyond basic lead lookup. Router mounts **posts**,
**search**, and **popular** (see nested READMEs).

## Endpoints

| Route | README |
|-------|--------|
| `POST /instagram/advanced/posts` | This page (posts section) |
| `POST /instagram/advanced/search` | [search/README.md](./search/README.md) |
| `POST /instagram/advanced/popular` | [popular/README.md](./popular/README.md) |

### Posts — `POST /instagram/advanced/posts`

```json
{
  "username": "leomessi",
  "cursor": null,
  "count": 12,
  "pages": 1
}
```

| Field | Notes |
| --- | --- |
| `username` | Handle or profile URL |
| `cursor` | Prior `pageInfo.endCursor` (`next_max_id`) for scroll |
| `count` | Per-page size (default 12, max 50) |
| `pages` | Pages to fetch in one call (default 1, max 20) |

## Instagram network sources

Captured against `https://www.instagram.com/{username}/` (public account):

| When | Call |
| --- | --- |
| Profile / first posts | `GET /api/v1/feed/user/{username}/username/?count=12` |
| On scroll | same URL + `&max_id={next_max_id}` |
| GraphQL alternate | `POST /graphql/query` · `doc_id=34030839746560163` · `PolarisProfilePostsTabContentQuery_connection` · root field `xdt_api__v1__feed__user_timeline_graphql_connection` |

This module uses the **REST feed/user** path (stable cursor = GraphQL `page_info.end_cursor`).

## Architecture

```
instagram/advanced/
├── index.ts          # Router (posts + search + popular)
├── constants.ts      # Routes, doc_ids, limits, errors
├── schemas.ts        # IG_ADVANCED_POSTS_REQUEST_SCHEMA
├── types.ts / client.ts / handler.ts / compute/
├── search/           # keyword / content search
├── popular/          # /popular/{q}/ topic reels (Puppeteer)
└── README.md
```

## Smoke

```bash
cd backend && pnpm exec tsx scripts/instagram-advanced-posts-smoke.ts leomessi
```
