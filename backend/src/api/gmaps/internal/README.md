# Google Maps search (`POST /gmaps/internal`)

Primary Maps lead search for the product. Validates with root
`../schemas.ts` → `GMAPS_REQUEST_SCHEMA`.

## Endpoint

| Method | Route | Config |
|--------|-------|--------|
| `POST` | `/gmaps/internal` | `API_ENDPOINTS.GMAPS.INTERNAL` |

## Request (summary)

At least one of `query`, `placeType`, or `urls` is required. When `country` is
set, `countryCode` (ISO alpha-2) is required.

| Field | Notes |
|-------|--------|
| `query` / `placeType` | Text text and/or place-type enum |
| `country` / `state` / `cities` | Location scope |
| `countryCode` | Required if `country` set |
| `urls` | Optional direct Maps place URLs |
| `enrichment` | Filter defaults from `filters/` |
| `limit` | Result cap |

## Response

`ALApiResponse` of Maps lead items — see `types.ts` / FE Maps cards.

## Layout

```
internal/
├── index.ts / handler.ts / helpers.ts
├── types.ts / constants.ts
└── console-debugger.js   # Dev aid
```
