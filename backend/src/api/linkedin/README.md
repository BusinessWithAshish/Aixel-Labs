# LinkedIn API

People or company discovery in one mount: **`POST /linkedin`**. Route by
required discriminant `searchType`.

## Endpoint

| Method | Route | Config |
|--------|-------|--------|
| `POST` | `/linkedin` | `API_ENDPOINTS.LINKEDIN.API` |

## Request

Schemas in `schemas.ts`:

| `searchType` | Schema | Role |
|--------------|--------|------|
| `"people"` | `LINKEDIN_BY_PEOPLE_REQUEST_SCHEMA` | Profile search |
| `"company"` | `LINKEDIN_BY_COMPANY_REQUEST_SCHEMA` | Company search |

Both include `discovery_filters` (location + type-specific filters), optional
`enrichment`, and `limit` (max 250, default 100). See schema `.describe()` for
field lists.

Missing or unknown `searchType` → `400`.

## Response

`ALApiResponse<LINKEDIN_BY_PEOPLE_RESPONSE[]>` or
`ALApiResponse<LINKEDIN_BY_COMPANY_RESPONSE[]>` — see `types.ts`.

## Layout

```
linkedin/
├── index.ts / handler.ts
├── schemas.ts / types.ts / constants.ts
└── helpers/
    ├── people.ts
    └── company.ts
```

## FE note

Company search is the default product path; people search may be gated by a
frontend feature flag.
