# Instagram Advanced — Content Search → Leads

## Breakthrough

Native Instagram keyword search (`/explore/search/keyword/?q=…`) redirects to
**login**. Do not depend on it.

Working pipeline (verified `salon pune`):

1. **GSearch** content queries (not profile-title biased):
   - `site:instagram.com/p {query}` → posts
   - `site:instagram.com/reel {query}` → reels
2. Classify URLs → shortcodes
3. `GET https://www.instagram.com/p|reel/{shortcode}/` (TLS + proxy)
4. Parse **`og:url`**: `instagram.com/{username}/p|reel/{shortcode}/`
5. Dedupe handles → optional `web_profile_info` / feed enrich

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
