# Google Trends API

Returns Google Trends "Trending Now" results for any supported country, language,
and time window by fetching the server-rendered trending page and parsing the
embedded `AF_initDataCallback` `ds:0` data block.

## Endpoint

| Method | Route                     | Config key                              |
| ------ | ------------------------- | --------------------------------------- |
| `POST` | `/google-trends/trending` | `API_ENDPOINTS.GOOGLE_TRENDS.TRENDING` |

## Request body

Validated by `schemas.ts` → `GOOGLE_TRENDS_REQUEST_SCHEMA`.

| Field      | Type     | Default       | Notes                                                                                     |
| ---------- | -------- | ------------- | ----------------------------------------------------------------------------------------- |
| `geo`      | `string` | `"US"`        | 2-letter ISO 3166-1 alpha-2 country code (e.g. `US`, `IN`, `GB`, `JP`)                    |
| `hl`       | `string` | `"en"`        | BCP-47 language code (e.g. `en`, `es`, `hi`, `ja`)                                        |
| `hours`    | `number` | `24`          | Time window — one of `4`, `24`, `48`, `168` (Past 4h / 24h / 48h / 7 days)                |
| `category` | `number` | `0`           | Category ID. `0` = All categories. See `GOOGLE_TRENDS_CATEGORY` for the list              |
| `sort`     | `string` | `"relevance"` | `"relevance"` (native order), `"volume"` (volume desc), `"started"` (most recent first)   |
| `status`   | `string` | `"all"`       | `"all"`, `"trending"` (still active, no end timestamp), `"started"` (already peaked)      |
| `limit`    | `number` | `500`         | Max entries to return (max `5000`; 7-day windows can return 2000+)                        |

## Response

`ALApiResponse<GOOGLE_TRENDS_RESPONSE>` — see `types.ts`.

```ts
{
  geo: string;          // echoed geo
  geoName: string | null;  // e.g. "United States" (from ds:1)
  hl: string;           // echoed hl
  hours: number;        // echoed hours
  category: number;     // echoed category
  sort: string;         // echoed sort
  status: string;       // echoed status
  totalParsed: number;  // entries parsed from the page before filtering
  totalResults: number; // entries returned after filtering/sorting/limiting
  trends: {
    title: string;
    geo: string;
    startedAt: number | null;   // Unix seconds
    endedAt: number | null;     // Unix seconds, or null if still trending
    volume: number | null;      // scaled search count
    score: number | null;       // opaque scaled score (1000 = hottest)
    relatedQueries: string[];
    categories: number[];       // category IDs — see GOOGLE_TRENDS_CATEGORY_NAMES
    articles: { id: string; language: string; geo: string }[];
  }[];
  raw: string;          // verbatim ds:0 JSON string
}
```

## How it works

1. Build URL: `https://trends.google.com/trending?geo={geo}&hl={hl}&hours={hours}`.
2. GET the page with a browser-like TLS fingerprint (node-tls-client) and an
   Evomi residential proxy when configured (country-routed to `geo`).
3. Google server-side renders the trending data into an inline
   `AF_initDataCallback({key:'ds:0', data:[null, [...entries]]})` script block.
   We locate the block, balance-bracket-scan the `data:` payload, and `JSON.parse` it.
4. Each raw entry tuple `[title, null, geo, [startedAt], [endedAt]|null, null, volume, null, score, relatedQueries[], categories[], articles[], title]`
   is mapped to a typed `GOOGLE_TRENDS_TREND`.
5. `category` (post-filter on `entry.categories`), `status` (post-filter on `endedAt`),
   `sort`, and `limit` are applied as post-processing — these are client-side-only
   filters in the Google Trends UI, so the SSR HTML always returns every entry.
6. The `ds:1` block (e.g. `["United States"]`) is parsed for a human-readable `geoName`.

## Why scrape the SSR HTML instead of the `batchexecute` RPC?

The new Google Trends UI fetches updates via `/_/TrendsUi/data/batchexecute`
with RPC IDs like `DqDTgb` / `Tnt4U` / `g4kJzf`. That endpoint requires a valid
`f.sid` session token, a `bl` build ID, and an `f.req` RPC envelope that
rotates with each frontend release — fragile and undocumented. The initial
page load, by contrast, embeds the **complete** trending dataset server-side
in `AF_initDataCallback`, so a single unauthenticated GET returns everything
we need. We only fall back to `batchexecute`-style updates if/when needed.

## Category IDs

| ID | Name                     | ID | Name                      |
| -- | ------------------------ | -- | ------------------------- |
| 0  | All categories           | 11 | Other                     |
| 1  | Autos and Vehicles       | 13 | Pets and Animals          |
| 2  | Beauty and Fashion       | 14 | Politics                  |
| 3  | Business and Finance     | 15 | Science                   |
| 4  | Entertainment            | 16 | Shopping                  |
| 5  | Food and Drink           | 17 | Sports                    |
| 6  | Games                    | 18 | Technology                |
| 7  | Health                   | 19 | Travel and Transportation |
| 8  | Hobbies and Leisure      | 20 | Climate                   |
| 9  | Jobs and Education       |    |                           |
| 10 | Law and Government       |    |                           |

## Folder layout (DRY)

| Concern                                         | Location                          |
| ----------------------------------------------- | --------------------------------- |
| Endpoint URL, routes, labels, maps, query params, HTML markers, headers | `./constants.ts` |
| Value types (`HOURS_VALUE`, `CATEGORY_ID`, …) + request/response/entry types | `./types.ts` |
| Zod request schema (derives unions from `*_VALUES`) | `./schemas.ts`                |
| URL builder                                     | `./url.ts`                        |
| `AF_initDataCallback` extract + entry mapping   | `./parse/`                        |
| Category / status / sort post-processing        | `./filter.ts`                     |
| Fetch orchestration + public helper barrel      | `./helpers.ts`                    |
| Generic Express handler factory                 | `./create-handler.ts`             |
| Express handler (thin)                          | `./handler.ts`                    |
| Route registration + public exports             | `./index.ts`                      |

### Adding a new field

1. Add the constant / enum value in `constants.ts` (single source of truth).
2. Extend the raw tuple / parsed type in `types.ts`.
3. Map it in `parse/map-entry.ts`.
4. If it is a request filter, add a Zod field in `schemas.ts` and wire it in `filter.ts` + `helpers.ts`.

## Smoke test

```bash
pnpm exec tsx scripts/google-trends-api-smoke.ts
```

Network-dependent: requires direct or Evomi-proxied access to `trends.google.com`.
