import {
  GMAPS_DETAILS_DEFAULTS,
  GMAPS_DETAILS_PLACE_PAGE_URL,
  GMAPS_DETAILS_PLACE_URL,
  GMAPS_DETAILS_RICH_PB_FLAGS,
} from "./constants";
import type { GMAPS_DETAILS_REQUEST, GmapsDetailsRichness } from "./types";
import { GMAPS } from "../internal/constants";
import {
  closeUrlFetchSession,
  createGmapsSession,
  delay,
  extractPsi,
  pickBrowserProfile,
} from "../internal/helpers";
import type { BrowserProfile } from "../internal/constants";
import {
  DEFAULT_HTML_HEADERS,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import { mergeHttpHeaderRecords } from "../../../utils/async-helpers";
import {
  parseFeatureIdFromUrl,
  parseGlFromUrl,
  parsePlaceIdFromUrl,
} from "./parse-place-url";
import {
  extractPlaceObject,
  extractReviewCount,
} from "./compute/parse-place";

export { parseFeatureIdFromUrl, parsePlaceIdFromUrl } from "./parse-place-url";

/**
 * `/maps/preview/place` often returns a sparse card first (rating only;
 * `p[4][8]` / reviews text missing). Place-page HTML warm can also count as
 * that first hit, so a fixed "discard one, keep two" pass is flaky — keep
 * refetching until reviewCount appears (same pattern as internal search
 * pages merging sparse → filled cards).
 */
const DETAILS_FILL_DELAY_MS = { min: 450, max: 1100 } as const;
const DETAILS_PREVIEW_MAX_ATTEMPTS = 5;

function profileHeaders(p: BrowserProfile): Record<string, string> {
  return {
    "user-agent": p.userAgent,
    "sec-ch-ua": p.secChUa,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": p.platform,
  };
}

function xhrHeaders(p: BrowserProfile, hl: string): Record<string, string> {
  return mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, profileHeaders(p), {
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
}

function navHeaders(p: BrowserProfile): Record<string, string> {
  return mergeHttpHeaderRecords(DEFAULT_HTML_HEADERS, profileHeaders(p), {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate, br, zstd",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "upgrade-insecure-requests": "1",
    dnt: "1",
  });
}

/** Slim + optional rich flag tree for `/maps/preview/place`. */
export function buildPlaceDetailsPb(
  featureId: string,
  lat: number,
  lng: number,
  richness: GmapsDetailsRichness,
  name?: string,
  psi?: string | null,
): string {
  const fid = featureId;
  const alt = GMAPS_DETAILS_DEFAULTS.ALTITUDE;
  let pb =
    `!1m14!1s${fid}` +
    `!3m12!1m3!1d${alt}!2d${lng}!3d${lat}` +
    `!2m3!1f0!2f0!3f0!3m2!1i${GMAPS_DETAILS_DEFAULTS.SCREEN_W}!2i${GMAPS_DETAILS_DEFAULTS.SCREEN_H}!4f13.1`;

  if (psi) {
    // Match search scraper’s session segment shape.
    pb += `!22m3!1s${psi}!2z!7e81`;
  }

  if (richness === "rich") {
    const nameSeg = name ? `!39s${name.replace(/\s+/g, "+")}` : "";
    pb += `${GMAPS_DETAILS_RICH_PB_FLAGS}${nameSeg}`;
  }

  return pb;
}

function extractPsiFromHtml(html: string): string | null {
  return (
    html.match(/[?&]psi=([A-Za-z0-9_-]{20,60})\./)?.[1] ??
    html.match(
      /APP_INITIALIZATION_STATE[^;]{0,500}?"([A-Za-z0-9_-]{40,60})"/,
    )?.[1] ??
    [...html.matchAll(/"([A-Za-z0-9_-]{40,55})"/g)]
      .map((m) => m[1])
      .find(
        (s) =>
          !/^0ahUKEw/.test(s) &&
          /[A-Z]/.test(s) &&
          /[a-z]/.test(s) &&
          /[0-9_-]/.test(s),
      ) ??
    null
  );
}

/**
 * When only placeId is known, load the Maps place page HTML and extract
 * the feature id from the redirect / embedded data URL.
 */
async function resolveFeatureIdFromPlaceId(
  session: UrlFetchSession,
  profile: BrowserProfile,
  placeId: string,
): Promise<string | null> {
  const url = `${GMAPS_DETAILS_PLACE_PAGE_URL}${encodeURIComponent(placeId)}`;
  const resp = await session.get(url, {
    headers: navHeaders(profile),
  });
  const html = await resp.text();
  return parseFeatureIdFromUrl(html);
}

export type ResolvedPlaceIds = {
  featureId: string | null;
  placeId: string | null;
  name: string | undefined;
};

export async function resolvePlaceIdentifiers(
  session: UrlFetchSession,
  profile: BrowserProfile,
  req: GMAPS_DETAILS_REQUEST,
): Promise<ResolvedPlaceIds> {
  let featureId = req.featureId?.trim().toLowerCase() || null;
  let placeId = req.placeId?.trim() || null;
  const name = req.name?.trim() || undefined;

  if (req.url) {
    featureId = featureId ?? parseFeatureIdFromUrl(req.url);
    placeId = placeId ?? parsePlaceIdFromUrl(req.url);
  }

  if (!featureId && placeId) {
    featureId = await resolveFeatureIdFromPlaceId(session, profile, placeId);
  }

  return { featureId, placeId, name };
}

function stripXssi(raw: string): string {
  return raw.replace(/^\)\]\}'\n?/, "").trim();
}

/**
 * Fetch place details JSON from `/maps/preview/place`.
 * Returns the full parsed array (caller uses `[6]` as place object).
 */
export async function fetchPlacePreview(
  session: UrlFetchSession,
  profile: BrowserProfile,
  opts: {
    featureId: string;
    placeId?: string | null;
    name?: string;
    lat: number;
    lng: number;
    hl: string;
    gl: string;
    richness: GmapsDetailsRichness;
    psi?: string | null;
  },
): Promise<unknown> {
  const pb = buildPlaceDetailsPb(
    opts.featureId,
    opts.lat,
    opts.lng,
    opts.richness,
    opts.name,
    opts.psi,
  );

  // Match search scraper: concatenate pb (keep `!`); encode only `:` in feature id.
  const pbEncoded = pb.replace(/0x([0-9a-f]+):0x([0-9a-f]+)/gi, "0x$1%3A0x$2");
  const gl = opts.gl.toLowerCase();
  let url =
    `${GMAPS_DETAILS_PLACE_URL}?authuser=0` +
    `&hl=${encodeURIComponent(opts.hl)}` +
    `&gl=${encodeURIComponent(gl)}` +
    `&pb=${pbEncoded}`;

  if (opts.name) {
    url += `&q=${encodeURIComponent(opts.name)}`;
  } else if (opts.placeId) {
    url += `&q=${encodeURIComponent(`place_id:${opts.placeId}`)}`;
  }

  if (opts.psi) {
    url += `&psi=${opts.psi}.${Date.now()}.1`;
  }

  const resp = await session.get(url, {
    headers: xhrHeaders(profile, opts.hl),
  });

  if (resp.status === 429) throw new Error("[gmaps/details] Rate limited (429)");
  if (resp.status === 403) throw new Error("[gmaps/details] Forbidden (403)");
  if (resp.status >= 400) {
    throw new Error(`[gmaps/details] HTTP ${resp.status}`);
  }

  const raw = await resp.text();
  const body = stripXssi(raw);
  if (!body) throw new Error("[gmaps/details] Empty response body");

  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(
      `[gmaps/details] Failed to parse response (${body.slice(0, 120)})`,
      { cause: err },
    );
  }
}

/** Seed place-page cookies + fallback featureId / PSI when search warm fails. */
async function warmPlacePage(
  session: UrlFetchSession,
  profile: BrowserProfile,
  opts: {
    featureId: string | null;
    placeId: string | null;
    name?: string;
    lat: number;
    lng: number;
    hl: string;
    gl: string;
  },
): Promise<{ psi: string | null; featureIdFromHtml: string | null }> {
  const gl = opts.gl.toLowerCase();
  let url: string;
  if (opts.featureId) {
    const slug = encodeURIComponent(opts.name ?? "place").replace(/%20/g, "+");
    const fid = opts.featureId;
    url =
      `https://www.google.com/maps/place/${slug}` +
      `/@${opts.lat},${opts.lng},17z` +
      `/data=!3m1!4b1!4m6!3m5!1s${fid}!8m2!3d${opts.lat}!4d${opts.lng}` +
      `?hl=${opts.hl}&gl=${gl}`;
  } else if (opts.placeId) {
    url = `${GMAPS_DETAILS_PLACE_PAGE_URL}${encodeURIComponent(opts.placeId)}&hl=${opts.hl}&gl=${gl}`;
  } else {
    url = `https://www.google.com/maps?hl=${opts.hl}&gl=${gl}`;
  }

  const resp = await session.get(url, { headers: navHeaders(profile) });
  const html = await resp.text();
  return {
    psi: extractPsiFromHtml(html),
    featureIdFromHtml: parseFeatureIdFromUrl(html),
  };
}

function warmSearchQuery(req: GMAPS_DETAILS_REQUEST, name?: string): string {
  if (name?.trim()) return name.trim();
  if (req.placeId?.trim()) return `place_id:${req.placeId.trim()}`;
  return "google maps";
}

function previewHasReviewCount(data: unknown): boolean {
  const p = extractPlaceObject(data);
  return p != null && extractReviewCount(p) != null;
}

/**
 * Orchestrate session + resolve + fetch; returns raw API array.
 *
 * Mirrors `/gmaps/internal` sparse→filled behavior: search PSI warm, place-page
 * cookies, then `/maps/preview/place` until `p[4]` includes reviewCount (or
 * attempts exhausted — return best last payload).
 */
export async function fetchGmapsPlaceDetailsRaw(
  req: GMAPS_DETAILS_REQUEST,
): Promise<{ data: unknown; richness: GmapsDetailsRichness }> {
  const profile = pickBrowserProfile();
  const session = await createGmapsSession(profile);
  const hl = req.hl ?? GMAPS_DETAILS_DEFAULTS.HL;
  const richness = req.richness ?? GMAPS_DETAILS_DEFAULTS.RICHNESS;
  const countryCode = (
    req.countryCode ??
    (req.url ? parseGlFromUrl(req.url) : null) ??
    GMAPS_DETAILS_DEFAULTS.GL
  ).toLowerCase();
  let lat = req.lat ?? GMAPS.FALLBACK_LAT;
  let lng = req.lng ?? GMAPS.FALLBACK_LNG;

  try {
    const ids = await resolvePlaceIdentifiers(session, profile, req);
    if (!ids.featureId && !ids.placeId) {
      throw new Error("[gmaps/details] Could not resolve featureId or placeId");
    }

    let psi: string | null = null;
    try {
      const warmed = await extractPsi(
        session,
        profile,
        warmSearchQuery(req, ids.name),
        GMAPS.DEFAULT_HL,
        countryCode,
      );
      psi = warmed.psi;
      if (req.lat == null && warmed.lat) lat = warmed.lat;
      if (req.lng == null && warmed.lng) lng = warmed.lng;
    } catch (err) {
      console.warn(
        "[gmaps/details] extractPsi failed; falling back to place-page warm",
        err instanceof Error ? err.message : err,
      );
    }

    const placeWarm = await warmPlacePage(session, profile, {
      featureId: ids.featureId,
      placeId: ids.placeId,
      name: ids.name,
      lat,
      lng,
      hl,
      gl: countryCode,
    });
    psi = psi ?? placeWarm.psi;

    const featureId =
      ids.featureId ??
      placeWarm.featureIdFromHtml ??
      (ids.placeId ? "0x0:0x0" : null);

    if (!featureId) {
      throw new Error("[gmaps/details] Missing featureId");
    }

    const previewOpts = {
      featureId,
      placeId: ids.placeId,
      name: ids.name,
      lat,
      lng,
      hl,
      gl: countryCode,
      richness,
      psi,
    };

    let data: unknown = null;
    for (let attempt = 1; attempt <= DETAILS_PREVIEW_MAX_ATTEMPTS; attempt++) {
      data = await fetchPlacePreview(session, profile, previewOpts);
      if (previewHasReviewCount(data)) {
        return { data, richness };
      }
      if (attempt < DETAILS_PREVIEW_MAX_ATTEMPTS) {
        await delay(DETAILS_FILL_DELAY_MS.min, DETAILS_FILL_DELAY_MS.max);
      }
    }

    return { data, richness };
  } finally {
    await closeUrlFetchSession(session);
  }
}
