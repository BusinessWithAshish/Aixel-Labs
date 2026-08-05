# Google Maps advanced (`POST /gmaps/advanced`)

Batch-resolve Google Maps **place URLs** into detailed place leads (reuses
details pipeline).

## Endpoint

| Method | Route | Config |
|--------|-------|--------|
| `POST` | `/gmaps/advanced` | `API_ENDPOINTS.GMAPS.ADVANCED` |

## Request

`schemas.ts` → `GMAPS_ADVANCED_REQUEST_SCHEMA`:

```json
{
  "urls": ["https://www.google.com/maps/place/…"],
  "richness": "rich"
}
```

| Field | Notes |
|-------|--------|
| `urls` | 1–25 valid Maps place URLs (required) |
| `richness` | `slim` \| `rich` (default **`rich`**) |

## Response

Array of place-detail shaped leads (same family as `/gmaps/details`).

## Layout

```
advanced/
├── index.ts / handler.ts
├── schemas.ts / constants.ts
└── …
```

See also: [details/README.md](../details/README.md),
[PLACE_DETAILS_FINDINGS.md](../PLACE_DETAILS_FINDINGS.md).
