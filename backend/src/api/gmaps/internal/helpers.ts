// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — HELPERS
// ─────────────────────────────────────────────────────────────

import { ClientIdentifier } from "node-tls-client";
import {
  DEFAULT_HTML_HEADERS,
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import { mergeHttpHeaderRecords } from "../../../utils/async-helpers";
import { EARTH_RADIUS, GMAPS, TILE_SIZE, BrowserProfile } from "./constants";
import type { GMAPS_INTERNAL_RESPONSE } from "./types";

// ─────────────────────────────────────────────────────────────
//  UTILITIES
// ─────────────────────────────────────────────────────────────

/** Random jitter delay between [min, max] ms. */
export const delay = (min: number, max: number): Promise<void> =>
  new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));

/** Pick a random element from a readonly array. */
const pick = <T>(arr: readonly T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

/** Safely traverse a nested object by a path of integer keys. */
const dig = (obj: any, path: readonly number[]): any =>
  path.reduce((cur, k) => cur?.[k], obj);

// ─────────────────────────────────────────────────────────────
//  PROTOBUF HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Converts zoom + latitude to the altitude value used in the pb parameter.
 * Derived from Google Maps' JsProtoUrlSerializer math.
 */
export const computeAltitude = (zoom: number, lat: number): number => {
  const R = 27.3611 * EARTH_RADIUS * GMAPS.SCREEN_H;
  return (R * Math.cos((lat * Math.PI) / 180)) / (2 ** zoom * TILE_SIZE);
};

/**
 * Builds the protobuf `pb` URL parameter for a paginated Maps search.
 *
 * @param lat   - latitude of the search area
 * @param lng   - longitude of the search area
 * @param zoom  - map zoom level (controls search radius)
 * @param page  - 1-indexed page number
 * @param psi   - page session ID extracted from the initial Maps HTML
 */
export const buildPb = (
  lat: number,
  lng: number,
  zoom: number,
  page: number,
  psi: string,
): string => {
  const alt = computeAltitude(zoom, lat);
  const offset = (page - 1) * GMAPS.RESULTS_PER_PAGE;

  return (
    `!4m8!1m3!1d${alt}!2d${lng}!3d${lat}` +
    `!3m2!1i${GMAPS.SCREEN_W}!2i${GMAPS.SCREEN_H}!4f13.1!7i20!8i${offset}` +
    `!10b1!12m25!1m1!18b1!2m3!5m1!6e2!20e3` +
    `!6m16!4b1!23b1!26i1!27i1!41i2!45b1!49b1!63m0!67b1!73m0` +
    `!74i150000!75b1!89b1!105b1!109b1!110m0` +
    `!10b1!16b1!19m4!2m3!1i360!2i120!4i8` +
    `!22m3!1s${psi}!2z!7e81` +
    `!24m5!1m4!13m2!2b1!3b1!2b1!5b1`
  );
};

// ─────────────────────────────────────────────────────────────
//  SESSION / HEADERS
// ─────────────────────────────────────────────────────────────

/** One profile per handler run; fresh TLS session (batch) per city. */
export const pickBrowserProfile = (): BrowserProfile =>
  pick(GMAPS.BROWSER_PROFILES);

const profileHeaders = (p: BrowserProfile): Record<string, string> => ({
  "user-agent": p.userAgent,
  "sec-ch-ua": p.secChUa,
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": p.platform,
});

/** Per-city batch session — shared cookie jar for PSI + pagination. */
export const createGmapsSession = (
  profile: BrowserProfile,
): Promise<UrlFetchSession> =>
  createUrlFetchSession({
    clientIdentifier: profile.clientIdentifier as ClientIdentifier,
    headers: profileHeaders(profile),
    useProxy: false,
  });

export { closeUrlFetchSession };

/** Maps PSI navigation — cold document load on top of DEFAULT_HTML_HEADERS. */
const navHeaders = (p: BrowserProfile): Record<string, string> =>
  mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, profileHeaders(p), {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br, zstd",
    "cache-control": "max-age=0",
    "upgrade-insecure-requests": "1",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    dnt: "1",
  });

/** Paginated Maps search API — XHR from the Maps page. */
const xhrHeaders = (p: BrowserProfile, hl: string): Record<string, string> =>
  mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, profileHeaders(p), {
    accept: "*/*",
    "accept-language": `${hl},en;q=0.9`,
    "accept-encoding": "gzip, deflate, br, zstd",
    referer: "https://www.google.com/maps",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-maps-diversion-context-bin": "1",
    dnt: "1",
  });

// ─────────────────────────────────────────────────────────────
//  CORE FETCHERS
// ─────────────────────────────────────────────────────────────

/**
 * Fetches the initial Google Maps search page for a query, extracts
 * the PSI token and coordinates from the HTML response.
 *
 * Uses three PSI extraction strategies in order of reliability:
 *   1. psi= inside embedded pagination URLs (most stable)
 *   2. APP_INITIALIZATION_STATE in raw HTML
 *   3. Broad base64url character scan (last resort)
 *
 * The TLS session's cookie jar is automatically populated by this
 * request — cookies are sent transparently in subsequent requests
 * that reuse the same session.
 */
export const extractPsi = async (
  session: UrlFetchSession,
  profile: BrowserProfile,
  query: string,
  hl = GMAPS.DEFAULT_HL,
  gl: string,
): Promise<{ psi: string; lat: number; lng: number }> => {
  const slug = query.toLowerCase().trim().replace(/\s+/g, "+");
  const url =
    GMAPS.MAPS_SEARCH_URL + slug + `?hl=${hl}` + `&gl=${gl.toLowerCase()}`;
  const resp = await session.get(url, { headers: navHeaders(profile) });

  if (resp.status >= 400) {
    throw new Error(`[extractPsi] HTTP ${resp.status}`);
  }

  const html = await resp.text();

  const unusualTraffic = html.includes("unusual traffic");
  if (unusualTraffic || html.length < 10_000) {
    throw new Error(
      `[extractPsi] Bot detection triggered — HTTP ${resp.status}, len=${html.length}, unusualTraffic=${unusualTraffic}`,
    );
  }

  // ── PSI extraction (3 strategies) ────────────────────────────
  const psi =
    // S1: psi= in embedded pagination URLs — most stable
    html.match(/[?&]psi=([A-Za-z0-9_-]{20,60})\./)?.[1] ??
    // S2: APP_INITIALIZATION_STATE blob in raw HTML
    html.match(
      /APP_INITIALIZATION_STATE[^;]{0,500}?"([A-Za-z0-9_-]{40,60})"/,
    )?.[1] ??
    // S3: broad base64url scan with character-type quality filter
    [...html.matchAll(/"([A-Za-z0-9_-]{40,55})"/g)]
      .map((m) => m[1])
      .find(
        (s) =>
          !/^0ahUKEw/.test(s) &&
          /[A-Z]/.test(s) &&
          /[a-z]/.test(s) &&
          /[0-9_-]/.test(s),
      ) ??
    null;

  if (!psi) {
    throw new Error("[extractPsi] Could not extract PSI from Maps HTML");
  }

  // ── Coordinate extraction ─────────────────────────────────────
  let lat = 0,
    lng = 0;

  const fromUrl = html.match(/@(-?\d+\.\d+),(-?\d+\.\d+),\d+z/);
  if (fromUrl) {
    lat = parseFloat(fromUrl[1]);
    lng = parseFloat(fromUrl[2]);
  } else {
    const fromPb = html.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
    if (fromPb) {
      lng = parseFloat(fromPb[1]);
      lat = parseFloat(fromPb[2]);
    }
  }

  const coordsFromFallback = !lat || !lng;
  if (coordsFromFallback) {
    lat = GMAPS.FALLBACK_LAT;
    lng = GMAPS.FALLBACK_LNG;
  }

  return { psi, lat, lng };
};

/**
 * Fetches one page of search results from the Maps internal API.
 *
 * The TLS session's cookie jar (populated by extractPsi) is used
 * automatically — no manual cookie management needed.
 *
 * Throws distinct errors for 429 and 403 so the caller can decide
 * whether to abort immediately or retry.
 */
export const fetchPage = async (
  session: UrlFetchSession,
  profile: BrowserProfile,
  query: string,
  lat: number,
  lng: number,
  page: number,
  psi: string,
  hl = GMAPS.DEFAULT_HL,
  gl: string,
  zoom = GMAPS.DEFAULT_ZOOM,
): Promise<any> => {
  const pb = buildPb(lat, lng, zoom, page, psi);
  const url =
    GMAPS.MAPS_API_URL +
    "?tbm=map" +
    `&hl=${hl}` +
    `&gl=${gl.toLowerCase()}` +
    `&pb=${pb}` +
    `&q=${encodeURIComponent(query)}` +
    "&tch=1" +
    `&ech=${page}` +
    `&psi=${psi}.${Date.now()}.1`;

  const resp = await session.get(url, { headers: xhrHeaders(profile, hl) });

  if (resp.status === 429) throw new Error("[fetchPage] Rate limited (429)");
  if (resp.status === 403) throw new Error("[fetchPage] Forbidden (403)");
  if (resp.status >= 400) throw new Error(`[fetchPage] HTTP ${resp.status}`);

  // Strip trailing JS comment block  e.g. /*""*/
  let raw = (await resp.text())
    .replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, "")
    .trim();

  if (!raw) {
    throw new Error("[fetchPage] Empty response body");
  }

  try {
    // Handle both response wrapper formats Google uses
    if (raw.startsWith("{")) {
      const wrapper = JSON.parse(raw);
      const payload = wrapper.d?.replace(/^\)\]\}'\s*\n?/, "") ?? "";
      return JSON.parse(payload);
    }
    return JSON.parse(raw.replace(/^[^\[]+/, ""));
  } catch (err) {
    const preview = raw.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `[fetchPage] Failed to parse response (${preview || "no content"})`,
      { cause: err },
    );
  }
};

// ─────────────────────────────────────────────────────────────
//  PARSING
// ─────────────────────────────────────────────────────────────

/**
 * Extracts rating from p[4].
 * Tries the known index first, then scans for a float in 1.0–5.0 range.
 * Handles cases where Google returns the array in a different shape.
 */
const extractRating = (p4: any): number | null => {
  if (!p4 || !Array.isArray(p4)) return null;
  const val = p4[7];
  return typeof val === "number" && val >= 1.0 && val <= 5.0 ? val : null;
};

/**
 * Parses a review count from any value Google puts at p[4][8] or p[4][3][1].
 *
 * Google returns review counts in several formats:
 *   number  → 1234
 *   string  → "1,234"  |  "(1,234)"  |  "1.2K"  |  "1.2K reviews"
 */
const parseReviewValue = (val: any): number | null => {
  if (typeof val === "number" && Number.isInteger(val) && val > 0) return val;
  if (typeof val !== "string") return null;

  // Strip parentheses, spaces, commas, and common suffixes
  const cleaned = val.replace(/[(),\s]/g, "").replace(/reviews?$/i, "");

  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)K$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1_000);

  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)M$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);

  const numMatch = cleaned.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);

  return null;
};

/**
 * Extracts review count from p[4].
 * Tries p[4][8] (integer or formatted string) first, then falls back to
 * parsing the review-text string at p[4][3][1] (e.g. "(1,234 reviews)").
 */
const extractReviewCount = (p4: any): number | null => {
  if (!p4 || !Array.isArray(p4)) return null;

  const fromIndex = parseReviewValue(p4[8]);
  if (fromIndex !== null) return fromIndex;

  // Fallback: parse from the review-text string Google embeds at p4[3][1]
  return parseReviewValue(p4[3]?.[1]);
};

/**
 * Extracts structured place data from a raw Maps API response.
 *
 * Field paths are driven entirely by GMAPS.FIELDS — update the
 * constants if the inspector script reports path changes.
 */
export const parsePlaces = (data: any): GMAPS_INTERNAL_RESPONSE[] => {
  const block = data?.[0]?.[1];
  if (!Array.isArray(block)) return [];

  const { FIELDS } = GMAPS;
  const places: GMAPS_INTERNAL_RESPONSE[] = [];

  for (let i = 1; i < block.length; i++) {
    const item = block[i];
    if (!Array.isArray(item) || !item[14]) continue;
    const p = item[14];

    const placeId = p[FIELDS.PLACE_ID] ?? null;

    const p4 = p[FIELDS.RATING[0]];

    places.push({
      id: placeId,
      placeId,
      name: p[FIELDS.NAME] ?? null,
      address: p[FIELDS.FULL_ADDRESS] ?? p[FIELDS.ALT_ADDRESS] ?? null,
      lat: p[FIELDS.COORDS]?.[FIELDS.COORDS_LAT] ?? null,
      lng: p[FIELDS.COORDS]?.[FIELDS.COORDS_LNG] ?? null,
      phone: dig(p, FIELDS.PHONE) ?? null,
      website: dig(p, FIELDS.WEBSITE) ?? null,
      categories: p[FIELDS.CATEGORIES] ?? null,
      rating: extractRating(p4) ?? null,
      reviewCount: extractReviewCount(p4) ?? null,
      gmapsUrl: placeId ? `${GMAPS.MAPS_PLACE_URL}${placeId}` : null,
    });
  }

  return places;
};

// ─────────────────────────────────────────────────────────────
//  QUERY BUILDER
// ─────────────────────────────────────────────────────────────

/**
 * Expands a base query + list of cities into individual search strings.
 * e.g. "cake shops" + ["Mumbai", "Pune"] + "Maharashtra" + "India"
 *      → ["cake shops Mumbai, Maharashtra, India", ...]
 */
export const generateQueries = (
  query: string,
  cities: string[],
  state: string,
  country: string,
): string[] =>
  cities
    .filter(Boolean)
    .map((city) => `${query} ${city}, ${state}, ${country}`);
