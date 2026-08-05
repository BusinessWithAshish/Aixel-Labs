# Facebook Pages API

Discover Facebook Pages via Google CSE (`site:facebook.com`) then enrich from
Page HTML (mbasic / www). Mounted at **`POST /facebook`**.

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

## Layout

```
facebook/
├── index.ts / handler.ts / client.ts
├── schemas.ts / types.ts / constants.ts / helpers.ts
└── compute/          # query builders, page HTML mapping
```

## Smoke / FE

Used by frontend lead-gen Facebook flow. No Mongo in this module.
