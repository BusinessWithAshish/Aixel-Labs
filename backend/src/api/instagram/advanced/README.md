# Instagram Advanced API

Public Instagram enrichment beyond basic lead lookup. Router mounts **posts**
and **search** (see nested README).

## Endpoints

| Route | README |
|-------|--------|
| `POST /instagram/advanced/posts` | This page (posts section) |
| `POST /instagram/advanced/search` | [search/README.md](./search/README.md) |

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
| `cursor` | Prior `pageInfo.endCursor` for scroll |
| `count` | Per-page size (default 12, max 50) |
| `pages` | Pages to fetch in one call (default 1, max 20) |

## Instagram network sources

All logged-out GraphQL (`../graphql.ts`, see [../README.md](../README.md)):

| Step | Query | Notes |
| --- | --- | --- |
| Grid + cursor | `posts` (`PolarisLoggedOutDesktopWWWProfilePostsTabContentQuery`) | 12 per call max, so `count` > 12 is several calls |
| Per-post counts + media | `media` (`PolarisLoggedOutDesktopWWWPostRootContentQuery`) | likes, comments, `taken_at`, video/image URLs, carousel slides; 4 in parallel |
| Reel plays | `reels` (`PolarisLoggedOutDesktopWWWProfileReelsTabContentQuery`) | joined on pk; scan stops once past the oldest reel |

`GET /api/v1/feed/user/{username}/username/` (the old REST path) answers
`401 require_login` to guests since Sep 2026. `viewCount` is never exposed.

`images` / `videos` carry the **largest rendition only** — the post query
returns a dozen signed crops of every picture (3 carousels came to 265 KB).
Carousel slides omit `user` (it is the parent's).

## Architecture

```
instagram/advanced/
├── index.ts          # Router (posts + search)
├── constants.ts      # Routes, limits, errors
├── schemas.ts        # IG_ADVANCED_POSTS_REQUEST_SCHEMA
├── types.ts / client.ts / handler.ts / compute/
├── search/           # keyword / content search
└── README.md
```

## Smoke

```bash
cd backend && pnpm exec tsx scripts/instagram-advanced-posts-smoke.ts leomessi
```
