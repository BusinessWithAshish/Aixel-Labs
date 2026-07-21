# YouTube Suggest API

Returns YouTube autocomplete suggestions for a partial search query by calling
the same `suggestqueries-clients6.youtube.com/complete/search` endpoint the
YouTube web search box uses. The response is JSONP wrapped in
`window.google.ac.h([...])`; we strip the wrapper and return both the parsed
suggestions and the raw JSONP body.

## Endpoint

| Method | Route          | Config key                |
| ------ | -------------- | ------------------------- |
| `POST` | `/youtube/suggest` | `API_ENDPOINTS.YOUTUBE.SUGGEST` |

## Request body

Validated by `schemas.ts` → `YOUTUBE_SUGGEST_REQUEST_SCHEMA` (extends shared
`YOUTUBE_GEO_REQUEST_SCHEMA`).

| Field     | Type     | Default | Notes                                                       |
| --------- | -------- | ------- | ----------------------------------------------------------- |
| `country` | `string` | `"US"`  | 2-letter ISO code — proxy routing + InnerTube `gl`          |
| `region`  | `string` | —       | Optional proxy region (not sent to YouTube)                 |
| `query`   | `string` | required| 1–500 chars                                                 |
| `hl`      | `string` | `"en"`  | BCP-47 language code (e.g. `en`, `es`, `hi`)                |
| `cp`      | `number` | —       | Optional cursor position passed through as the `cp` param  |

## Response

`ALApiResponse<YOUTUBE_SUGGEST_RESPONSE>` — see `types.ts`.

```ts
{
  query: string;                 // echoed query
  suggestions: {
    text: string;                // suggestion text
    type: number;                // suggestion-type code (0 = default query)
    subtypes: number[];          // subtype code list (e.g. [512] for video)
  }[];
  totalResults: number;          // suggestions.length
  raw: string;                   // raw JSONP body, e.g. `window.google.ac.h([...])`
}
```

## How it works

1. `createYoutubeFetchSession({ country })` — country-targeted Evomi proxy when configured.
2. Build URL: `https://suggestqueries-clients6.youtube.com/complete/search?ds=yt&hl={hl}&gl={gl}&client=youtube&gs_ri=youtube&q={query}&cp={cp?}`.
3. GET the URL — YouTube returns `text/javascript` JSONP: `window.google.ac.h(["query", [["suggestion", 0, [512]], ...], {"k":1}])`.
4. Strip the `window.google.ac.h(` prefix and `)` suffix, parse the inner JSON array, and map each `[text, type, subtypes[]]` tuple to a typed `YOUTUBE_SUGGEST_ITEM`.
5. Return `{ query, suggestions, totalResults, raw }` — `raw` preserves the original JSONP body for callers that want the verbatim payload.

## Why `client=youtube`?

The browser's YouTube search box uses `client=youtube`, which returns JSONP
wrapped in `window.google.ac.h(...)`. Other clients (e.g. `client=firefox`)
return pure JSON but a different shape; we use the same client the browser
uses so the response matches what a user would see in the search dropdown.

## Folder layout (DRY)

| Concern                          | Location                                                    |
| -------------------------------- | ----------------------------------------------------------- |
| Route path + handler label       | `../constants.ts` (`YOUTUBE_API_ROUTES.SUGGEST`, `YOUTUBE_HANDLER_LABELS.SUGGEST`) |
| Endpoint URL + dataset/client    | `../constants.ts` (`YOUTUBE_SUGGEST_URL`, `YOUTUBE_SUGGEST_DATASET`, `YOUTUBE_SUGGEST_CLIENT`) |
| Default `hl` + max query length   | `../constants.ts` (`YOUTUBE_SUGGEST_DEFAULT_HL`, `YOUTUBE_SUGGEST_MAX_QUERY_LENGTH`) |
| JSONP wrapper + query-param names | `./constants.ts` (`YOUTUBE_SUGGEST_JSONP_*`, `YOUTUBE_SUGGEST_QUERY_PARAMS`, `YOUTUBE_SUGGEST_TYPE`) |
| Request/response/item types       | `./types.ts`                                                |
| Zod request schema                | `./schemas.ts`                                              |
| URL build + JSONP parse + fetch   | `./helpers.ts`                                              |
| Express handler (thin)            | `./handler.ts`                                              |

## Shared dependencies

- `../schemas` — `YOUTUBE_GEO_REQUEST_SCHEMA`
- `../constants` — `YOUTUBE_SUGGEST_URL`, `YOUTUBE_SUGGEST_*` config
- `../helpers` — `createYoutubeFetchSession`, `resolveYoutubeGeo`
