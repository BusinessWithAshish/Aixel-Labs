# Google Maps Place Details — Reverse Engineering Findings

**Date:** 2026-07-23  
**Status:** Implemented — see [`details/`](./details/) (`POST /gmaps/details`)  
**Probe place:** Vohuman Cafe, Pune (`ChIJHQkrD1jAwjsReTIzCjxLghc`)  
**Method:** Live Maps UI → network capture of SPA place navigation

---

## Verdict

Place details are **not** from official Places/FieldMask APIs. They come from the undocumented protobuf-URL endpoint:

```
GET https://www.google.com/maps/preview/place
  ?authuser=0
  &hl={hl}
  &gl={gl}
  &pb={JsProtoUrlSerializer}
  &q={optional display name}
```

Response shape:

```
)]}'
[null, [], null, null, [viewport…], null, PLACE_OBJECT, …]
```

The **place card** is `response[6]` — the **same nested-array object** as search listings (`tbm=map` → `p`), but with far more indices populated (~74 vs sparse listing).

Your current `/gmaps/internal` search scraper only reads listing-level fields. A second call to `/maps/preview/place` unlocks essentially everything shown on the Maps place panel (hours, popular times, attributes, plus code, editorial summary, reservations, photos, review topics, etc.).

---

## Related endpoints observed

| Endpoint | Role | Useful for details? |
|----------|------|---------------------|
| `/maps/preview/place` | **Primary place details** | **Yes — this is the one** |
| `/search?tbm=map&pb=…` | Search listings (current scraper) | Listing fields only |
| `/s?tbm=map&pb=…` | Autocomplete suggestions | No |
| `/maps/preview/lp` | Local promotions / ads prefs | No |
| `/maps/preview/log204` | Telemetry | No |
| `/maps/_/MapsWizUi/data/batchexecute` | e.g. `MapsViewportService.GetViewportMetadata` | Viewport metadata, not place |
| `/maps/vt/pb=…` | Map tiles | No |
| Document `GET /maps/place/…` | SSR HTML of place panel | Same data, harder to parse |

**About / Menu / Reviews tabs** did **not** fire extra detail XHRs in this session — About attributes were already inside `/maps/preview/place`. Full review pagination likely uses a separate preview/review endpoint (not registered in `APP_OPTIONS` preview list on this page build); sample review snippets already ship in `p[31]`.

---

## Request: `pb` parameter

### Working “slim” pb (≈38 KB response, most core fields)

Requires feature id `0xAAAA:0xBBBB` plus a viewport block:

```
!1m14!1s0x3bc2c0580f2b091d:0x17824b3c0a333279
!3m12!1m3!1d3585!2d{lng}!3d{lat}
!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1
```

URL-encode the `:` in the feature id as `%3A` when putting it in the query string.

### Rich browser pb (≈324 KB)

Maps appends a large flag tree (`!13m57…!15m111…!34m5…!37i787!39s{name}`) that pulls photos, owner, review histogram, review topics, geo hierarchy, etc. Slim still includes hours, popular times, attributes, plus code, editorial, reservations, phone, website.

### Identifiers

| ID | Example | Where |
|----|---------|-------|
| Feature id | `0x3bc2c0580f2b091d:0x17824b3c0a333279` | `p[10]`, URL `!1s…` |
| Place id | `ChIJHQkrD1jAwjsReTIzCjxLghc` | `p[78]` |
| CID (decimal) | `1693999131085976185` | lower hex of feature id → `p[181][5]`, `p[227][0][5]` |
| Freebase / KG | `/g/1yfprvc1p` | `p[89]` |
| Owner GAIA | `103194531623240809309` | `p[57][2]`, `p[181][6]` |

Feature id also appears in place URLs:

`/maps/place/…/data=!…!1s0x…:0x…!…`

---

## Response field map (`p = response[6]`)

### Already returned by current search scraper

| Field | Path | Notes |
|-------|------|-------|
| Name | `p[11]` | |
| Local name | `p[101]` | Mapped in constants, **not** in API response today |
| Place ID | `p[78]` | |
| Full address | `p[18]` | |
| Alt address | `p[39]` | |
| Lat / Lng | `p[9][2]` / `p[9][3]` | |
| Phone | `p[178][0][0]` | Also intl at `p[178][0][1][1][0]`, digits `p[178][0][3]` |
| Website | `p[7][0]` | Domain at `p[7][1]` |
| Categories (labels) | `p[13]` | |
| Rating | `p[4][7]` | |
| Review count | `p[4][8]` | |

### Extra fields available from `/maps/preview/place` (not in current API)

| Field | Path | Example / shape |
|-------|------|-----------------|
| **Feature id** | `p[10]` | `0x…:0x…` |
| **Price** | `p[4][2]`, `p[4][10]` | `₹1–200`, `₹1 to ₹200` |
| **Timezone** | `p[30]` | `Asia/Calcutta` |
| **Neighborhood** | `p[14]` | `Sangamvadi` |
| **City/region label** | `p[166]` | `Pune, Maharashtra` |
| **Country** | `p[243]` | `IN` |
| **Languages** | `p[110]`, `p[111]` | `en`, `mr` |
| **Category IDs** | `p[76]` | `[["cafe",null,2],["breakfast_restaurant","Breakfast",2],…]` |
| **Editorial title + blurb** | `p[32][0][1]`, `p[32][1][1]` | “Legendary cafe…”, longer description |
| **Dwell / visit duration** | `p[117][0]` | “People typically spend 15 min to 1 hr here” |
| **Opening hours (7 days)** | `p[203][0][i]` | `{day, dayIndex, date[y,m,d], ranges:[{text, times:[[h],[h,m]]}]}` |
| **Open/closed status text** | strings under `p[203]` | e.g. `Closed · Opens 6 am` |
| **Popular times** | `p[84][0][day]` | per hour: `[hour, busyPct, label, "", timeLabel]` |
| **Plus code** | `p[183][2][0]` / `p[183][2][2][0]` | `7JCMGVMG+2P`, `GVMG+2P Pune, Maharashtra` |
| **Address components** | `p[183][1]` | `[neighborhood, street, street, city, postal, state, country, [floor…]]` |
| **Floor / landmark hint** | `p[183][1][7]` | e.g. `["Floor 0"]` |
| **Attributes / About** | `p[100]` | nested; ids like `/geo/type/establishment_poi/has_delivery` + labels (Dine-in, Takeaway, Parking, Payments, Atmosphere, …) |
| **Reservation / order links** | `p[46]`, `p[75]` | Swiggy, Zomato, District, etc. |
| **Owner** | `p[57]` | name + GAIA id |
| **CID + id bundle** | `p[227][0]` | `[featureId, null, null, kgId, placeId, cid, ownerId]` |
| **Review star histogram** | `p[175][3]` | `[1★, 2★, 3★, 4★, 5★]` counts |
| **Review topic chips** | `p[153][0][i]` | e.g. bun maska, irani chai, cash only |
| **Sample review snippets** | `p[31]` | short quotes + reviewer contrib URLs |
| **Photos (hero / gallery)** | `p[51]`, `p[171]` | `lh3.googleusercontent.com` URLs |
| **Street View / pegman thumbs** | `p[37]` | panoid + thumbnail URLs |
| **Menu highlight photos** | `p[72]` | |
| **Geo hierarchy** | `p[245]` | India → Maharashtra → Pune → Sangamvadi (KG ids) |
| **Canonical preview URL** | `p[42]` | |
| **Thumbnail / avatar** | `p[157]`, `p[122]` | |
| **“See nearby …”** | `p[164]` | |
| **Encoded place token** | `p[209]` | base64-ish |

### Attribute categories observed under `p[100]` (About tab)

Service options, Highlights, Popular for, Offerings, Dining options, Amenities, Atmosphere, Crowd, Planning, Payments, Children, Parking, Accessibility — each as `/geo/type/…` ids with human labels. Treat presence carefully: the tree mixes **confirmed** attributes with **editable/suggest** options; prefer the same subset the About UI renders (confirmed groups near the top of `p[100]`).

---

## Slim vs rich pb coverage

| Capability | Slim (~38 KB) | Rich (~324 KB) |
|------------|---------------|----------------|
| Core contact / rating / categories | ✅ | ✅ |
| Hours + popular times + attributes | ✅ | ✅ |
| Plus code, editorial, dwell, reservations | ✅ | ✅ |
| Photo galleries `p[51]`/`p[171]` | ❌ | ✅ |
| Owner `p[57]` | ❌ | ✅ |
| Review topics `p[153]` | ❌ | ✅ |
| Star histogram `p[175]` | ❌ | ✅ |
| Geo hierarchy `p[245]` | ❌ | ✅ |

For lead-gen enrichment, **slim is enough** for most high-value extras. Use the browser-rich `pb` flag set when photos / topics / histogram matter.

---

## Gap vs current `backend/src/api/gmaps`

Current module:

- Calls `/search?tbm=map` only
- Returns 11 listing fields
- `urls` / URL mode → **400 not implemented**
- No `/maps/preview/place` client

Highest-value additions for a place-details / URL enrichment path:

1. Feature id (`p[10]`) + CID  
2. Opening hours + open-now status  
3. Price level  
4. Plus code + structured address  
5. Service / amenity attributes (phone-quality signals: delivery, dine-in, etc.)  
6. Editorial description  
7. Reservation / order URLs  
8. Timezone, category IDs, popular times (optional)  
9. Local name (`p[101]` — already known, just not returned)

---

## Suggested call pattern

```
1. Search (existing) → placeId, optional featureId from p[10]
2. For each place (or URL-parsed featureId):
   GET /maps/preview/place?hl=&gl=&pb=!1m14!1s{featureId}!3m12!…
3. Parse response[6] with extended FIELDS map
```

From a Maps place URL, parse `!1s0x…:0x…` as feature id (implements unfinished URL mode).

Headers that matter (same family as search):

- `referer: https://www.google.com/maps`
- `x-maps-diversion-context-bin: CgIIAQ==` (or `1`)
- Browser-matched TLS / UA profile (existing `BROWSER_PROFILES`)

---

## Probe notes

- Intercepted live XHR when clicking a related place (SPA); full document navigation embeds SSR DOM but the same payload is available via `/maps/preview/place`.
- Last verified against Maps build `20260719.0` (`APP_OPTIONS`).
- Field indices can shift; extend `console-debugger.js` to hit `/maps/preview/place` as well as search.
