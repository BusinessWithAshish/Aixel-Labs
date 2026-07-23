# Google Maps Place Details (`POST /gmaps/details`)

Reverse-engineered place details via undocumented `/maps/preview/place`.

Complements search (`POST /gmaps/internal`) with:

1. **Base** — listing fields (+ `featureId`, `nameLocal`)
2. **Common** — hours, popular times, plus code, About buckets, photos, etc.
3. **byType** — type-group-specific extras (food, lodging, automotive, …)

See also: [PLACE_DETAILS_FINDINGS.md](../PLACE_DETAILS_FINDINGS.md)

## Request

```json
{
  "placeId": "ChIJ…",
  "featureId": "0x…:0x…",
  "url": "https://www.google.com/maps/place/…",
  "name": "Vohuman Cafe",
  "lat": 18.53,
  "lng": 73.87,
  "countryCode": "in",
  "hl": "en",
  "richness": "slim"
}
```

At least one of `placeId`, `featureId`, or `url` is required. `countryCode` is required.

| `richness` | Size | Notes |
|------------|------|--------|
| `slim` (default) | ~38 KB | Hours, attrs, popular times, plus code |
| `rich` | ~300 KB+ | + photos, owner, review topics/histogram |

## Response shape

```ts
{
  // base
  id, placeId, featureId, name, nameLocal, address, lat, lng,
  phone, website, rating, reviewCount, categories, gmapsUrl,

  common: { /* always attempted */ },
  byType: {
    foodAndDrink: null | { servesBreakfast?: boolean, … },
    lodging: null | { … },
    // … automotive, healthAndWellness, services, shopping,
    //   entertainmentAndRecreation, sports, finance, education, business
  },
  meta: { matchedGroups, source: "preview/place", richness }
}
```

`byType.*` is `null` when that group does not apply. Matched groups come from `p[76]` type ids + category label heuristics.

## Smoke

```bash
cd backend && pnpm exec tsx scripts/gmaps-place-details-smoke.ts
```

## Layout

```
details/
  client.ts          # TLS fetch + id resolution
  handler.ts
  schemas.ts / types.ts / constants.ts
  compute/           # parse + map common / hours / attrs / groups
```
