# Instagram Advanced — Popular topic (native, no GSearch)

## Breakthrough

Logged-out Instagram exposes topic reels at:

`https://www.instagram.com/popular/{keyword}/`

Example: `/popular/salon/` → title `Salon • 174M reels`, grid of public reels
with author handles + view counts. **No login required** in a real browser.

| Surface | Status |
| --- | --- |
| `/explore/` | Public “Popular on Instagram” hub |
| `/popular/{q}/` | **Works** — topic reels + related queries, browser-rendered only |
| `/explore/search/keyword/?q=` | Login wall |
| `/api/v1/tags/search/?q=` | Works (hashtag names only) |
| TLS HTML of `/popular/` | Shell — confirmed dead end, see below |

**Investigated twice (2026-08-12) — TLS-only fetch is a genuine dead end,
confirmed across two different routes, not a research gap.** A real browser
gets the full reel grid + first page of related keywords server-rendered
directly into the initial HTML: Comet's `RelayPrefetchedStreamCache` envelope
(query `PolarisLoggedOutPopularSearchPageQuery`) carries
`data.xig_logged_out_popular_search_media_info.edges[].node` (`code` /
shortcode, `user.username`, `play_count`, `caption.text`, `display_uri`, even
direct `video_versions[].url` CDN links) and a sibling
`data.popular_search_related_keywords_connection.edges[].node.query_text`.
First pass (browser network inspection only) concluded a plain TLS GET would
get the same thing, since no client-side GraphQL XHR carries this data. That
was wrong: live-tested a `node-tls-client` GET of the identical URL, with a
matching header set, both **with and without the Evomi proxy** — same ~650KB
response either way, but `xig_logged_out_popular_search_media_info` is absent
from both.

This isn't specific to `PolarisLoggedOutPopularSearchRoute` either — the same
test against individual post/reel pages (`PolarisLoggedOutDesktopWWWPostRoute`,
`data.xig_polaris_media`) came back identical: real browser gets the full
media object (`like_count`, `comment_count`, `taken_at`, `caption.text`,
`clips_metadata` music info, `location`), TLS client gets a page with zero
trace of `xig_polaris_media` — only the basic Open Graph meta tags
(`og:description` etc.), which is exactly what
`advanced/search/compute/resolve-owner.ts` already regexes. Ruled out
proxy/IP-reputation as the cause (no-proxy test got the identical shell too).

**Conclusion: Instagram gates its rich Comet/Relay SSR hydration payload
behind real-browser/JS-execution detection across HTML page routes in
general** (JS execution, or TLS/HTTP2-level fingerprinting beyond JA3 —
either way, not something `node-tls-client` can produce). Dedicated JSON API
endpoints are a different code path and are NOT gated this way — that's why
`web_profile_info` and the feed endpoints (used elsewhere in this module)
already work fine via plain TLS. The dividing line is "full HTML page with
embedded React hydration data" vs "dedicated JSON endpoint", not
route-by-route. Don't re-attempt a TLS-only fetch for a *new* HTML page route
expecting the embedded JSON to be there — check for a dedicated JSON endpoint
first.

**Production path:** `popular/client.ts` uses **Puppeteer + Evomi**
(`scrapePopularDom`) only — there's no lean fallback for this route, a plain
fetch simply cannot get the data.

Captured GraphQL (pagination of related chips beyond the SSR-embedded first page):

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
