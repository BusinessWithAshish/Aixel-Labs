# Instagram Advanced — Content Search → Leads

## Breakthrough

Native Instagram keyword search (`/explore/search/keyword/?q=…`) redirects to
**login**. Do not depend on it.

Working pipeline (verified `salon pune`):

1. **GSearch** content queries (not profile-title biased):
   - `site:instagram.com/p {query}` → posts
   - `site:instagram.com/reel {query}` → reels
2. Classify URLs → shortcodes
3. Shortcode → media pk (`mediaIdFromShortcode`), then the logged-out `media`
   GraphQL query (direct, see [../../README.md](../../README.md)) gives the
   owner, likes, comments and caption
4. Dedupe handles → optional profile enrich (`fetchFromEntities`)

Also works anonymously: `GET /api/v1/tags/search/?q=` (hashtag discovery).

## Endpoint

`POST /instagram/advanced/search`

```json
{
  "query": "salon pune",
  "kinds": ["post", "reel"],
  "pages": 1,
  "maxResolve": 24,
  "enrichProfiles": true,
  "country": "IN"
}
```

## Smoke

```bash
cd backend && pnpm exec tsx scripts/instagram-advanced-search-smoke.ts "salon pune"
```
