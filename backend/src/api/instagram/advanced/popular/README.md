# Instagram Advanced — Popular topic (native, no GSearch)

## Breakthrough

Logged-out Instagram exposes topic reels at:

`https://www.instagram.com/popular/{keyword}/`

Example: `/popular/salon/` → title `Salon • 174M reels`, grid of public reels
with author handles + view counts. **No login required** in a real browser.

| Surface | Status |
| --- | --- |
| `/explore/` | Public “Popular on Instagram” hub |
| `/popular/{q}/` | **Works** — topic reels + related queries |
| `/explore/search/keyword/?q=` | Login wall |
| `/api/v1/tags/search/?q=` | Works (hashtag names only) |
| TLS HTML of `/popular/` | Shell only — grid needs browser/GraphQL |

Captured GraphQL (pagination of related chips):

- `POST /api/graphql`
- `PolarisLoggedOutPopularSearchPageRelatedKeywordsPaginationQuery`
- `doc_id=27213343048290838`

## Endpoint

`POST /instagram/advanced/popular`

```json
{ "query": "salon", "maxReels": 24, "enrichProfiles": false }
```

## Smoke

```bash
cd backend && pnpm exec tsx scripts/instagram-popular-api-smoke.ts salon
```
