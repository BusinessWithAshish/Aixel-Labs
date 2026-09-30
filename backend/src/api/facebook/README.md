# Facebook Pages API

Discover Facebook Pages via Google CSE (`site:facebook.com`) then enrich from
Page HTML (`/about`, then a bare-www fallback). Mounted at **`POST /facebook`**.

**Facebook's guest gate on `/about` is probabilistic per TLS session, not a
static block.** Live testing (2026-09-30, via a throwaway-Chrome network
capture — see "Debugging a scraper that suddenly gets blocked" in the
`backend-utils` skill) found: a real logged-out browser *does* get genuine
Page data (name, followers, category, website) with zero cookies — no static
header/cookie fix was found to reliably reproduce it, but a fresh session
lands the real page roughly 1 in 6 tries, the rest getting a full-size page
shell whose `<meta http-equiv="refresh">` points at `/login` (parsed as
sparse, not returned as fake data). `mbasic.facebook.com` now unconditionally
redirects to login — dropped from the fallback chain entirely, it was pure
wasted attempts. The fix is `FACEBOOK_SPARSE_RETRY_MAX` in `constants.ts`:
keep retrying `/about` with fresh sessions (Evomi gives each one a different
exit IP already) until real content lands. This is not a 100% guarantee on
every call — a heavily-scraped target (verified live: `cocacola` specifically,
after repeated testing in one sitting) can still exhaust the budget, while a
less-hammered page of the same size (`starbucks`) came back with full data
first try in the same session. If a specific Page keeps coming back `[]`,
retrying the call later usually recovers it.

## Endpoint

| Method | Route | Config |
|--------|-------|--------|
| `POST` | `/facebook` | `API_ENDPOINTS.FACEBOOK.API` |

## Request

`schemas.ts` → `FACEBOOK_REQUEST_SCHEMA` (+ shared `LOCATION_FIELDS_SCHEMA`):

| Field | Notes |
|-------|--------|
| `entities` | Optional Page vanities or full Page URLs |
| `query` | Optional free-text discovery (e.g. `dentists in Pune`) |
| `country` / `state` / `region` / … | Location fields from utils |
| `keywords` / `excludeKeywords` | Bias / exclude discovery |
| `limit` | 1–250 (default 100) |

Provide `entities` and/or `query` (handler validates useful input).

## Response

`ALApiResponse<FACEBOOK_RESPONSE[]>` — see `types.ts`. Stable lead `id` for
product save.

`emails` / `address` / `likes` / `verified` are all actively used by the
frontend (`FacebookLeadCard.tsx` render, `lead-filter-matchers.ts` filters,
`lead-sort.ts` for `likes`, and swept into CSV export generically) — keep
them in the response even when null, don't remove. Checked 2026-09-30 which
of these are realistically ever non-null: `emails`/`address` are frequently
absent on large corporate/brand Pages (no public contact email, no single
physical location) but do populate for smaller local businesses — that's
real data sparsity, not a bug. `likes` looks structurally dead platform-wide:
a real captured Page body (Coca-Cola) shows only "106M followers" — Facebook
has dropped the public Like-count display from Pages entirely in favor of
Followers-only, so `parseCountNearLabel(text, /likes?/i)` has nothing left to
find on current Facebook, regardless of gating. `verified` still needs a
positive test case (a page with an actual checkmark) to confirm its selectors
still match current markup — not yet confirmed dead or alive.

## Layout

```
facebook/
├── index.ts / handler.ts / client.ts
├── schemas.ts / types.ts / constants.ts / helpers.ts
└── compute/          # query builders, page HTML mapping
```

## Smoke / FE

Used by frontend lead-gen Facebook flow. No Mongo in this module.

Also reachable via the `facebook` MCP tool, op `search` (`searchFacebookPages`
in `client.ts`) — same service, no HTTP loopback.
