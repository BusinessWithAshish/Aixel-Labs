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
