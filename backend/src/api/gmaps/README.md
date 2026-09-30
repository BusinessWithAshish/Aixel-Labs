# Google Maps API

Express mount at **`/gmaps`** with three POST subroutes. Shared request fields /
filters live in `schemas.ts`, `filters/`, and `place-types/`.

## Routes

| Sub-API | README | Method | Route |
|---------|--------|--------|-------|
| Internal search | [internal/README.md](./internal/README.md) | `POST` | `/gmaps/internal` |
| Place details | [details/README.md](./details/README.md) | `POST` | `/gmaps/details` |
| Advanced (URL batch) | [advanced/README.md](./advanced/README.md) | `POST` | `/gmaps/advanced` |

Config: `API_ENDPOINTS.GMAPS` in `backend/src/config.ts`.

## Layout

```
gmaps/
├── index.ts              # Registers internal + details + advanced
├── schemas.ts            # Shared GMAPS_REQUEST_* for search
├── filters/ / place-types/
├── helpers.ts
├── internal/             # Primary Maps search → leads
├── details/              # Single place via /maps/preview/place
├── advanced/             # Batch place URLs → details
└── PLACE_DETAILS_FINDINGS.md
```

## Product use

Frontend Maps lead-gen calls **internal** (query / placeType / cities) and can
pass **urls**; **advanced** resolves a batch of place URLs to rich details.

Also reachable via the `gmaps` MCP tool: ops `search` (internal's
`searchGmapsInternal`), `details` (`fetchGmapsPlaceDetails`), `advanced`
(`resolveGmapsAdvancedPlaces`) — same services, no HTTP loopback.

Every `session.get` in `internal/helpers.ts` and `details/client.ts` goes
through `utils/google-consent.ts` — this server's IP geolocates as EU, so a
cookie-less request gets redirected to Google's consent wall instead of
served directly (that's also why every request explicitly sets
`followRedirects` now — `node-tls-client` defaults it to `false`, which is
why this used to fail silently instead of surfacing the redirect). If Google
starts blocking again with a short-body/redirect error, see "Debugging a
scraper that suddenly gets blocked" in the `backend-utils` skill before
guessing at headers.
