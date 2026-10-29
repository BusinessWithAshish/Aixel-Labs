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

Also works anonymously: `GET /api/v1/tags/search/?q=` (hashtag discovery) →
`searchInstagramHashtags` (names + post counts, biggest first; rechecked
2026-10-28). Still login-only for guests: `/explore/tags/{tag}/`,
`/api/v1/tags/web_info/`, `/api/v1/users/search/` (302 to login),
`/web/search/topsearch/` (404).

A shortcode dates its post with no request: `takenAtFromMediaId(mediaIdFromShortcode(code))`
(the pk's top bits are ms since Instagram's 2011 epoch).

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
