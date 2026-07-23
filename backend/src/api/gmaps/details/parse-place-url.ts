const FEATURE_ID_RE = /0x[0-9a-f]+:0x[0-9a-f]+/i;
const FEATURE_ID_IN_URL_RE = /!1s(0x[0-9a-f]+(?::|%3A)0x[0-9a-f]+)/i;
const PLACE_ID_RE = /ChIJ[\w-]+/;
const PLACE_ID_QUERY_RE =
  /(?:place_id[=:]|q=place_id(?::|%3A)|[?&]query=place_id(?::|%3A))(ChIJ[\w-]+)/i;

const MAPS_HOST_SUFFIXES = [
  "google.com",
  "google.co.in",
  "google.co.uk",
  "maps.app.goo.gl",
  "goo.gl",
] as const;

function decodeUrl(url: string): string {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
}

function normalizeFeatureId(raw: string): string {
  return decodeUrl(raw).replace(/%3A/gi, ":").toLowerCase();
}

/** Parse `0x…:0x…` from a Maps place URL (`!1s` or anywhere). */
export function parseFeatureIdFromUrl(url: string): string | null {
  const decoded = decodeUrl(url);
  const fromBang = decoded.match(FEATURE_ID_IN_URL_RE)?.[1];
  if (fromBang) return normalizeFeatureId(fromBang);
  const any = decoded.match(FEATURE_ID_RE)?.[0];
  return any ? normalizeFeatureId(any) : null;
}

/** Parse `ChIJ…` Place ID from path, query (`place_id=`), or raw string. */
export function parsePlaceIdFromUrl(url: string): string | null {
  const decoded = decodeUrl(url);
  const fromQuery = decoded.match(PLACE_ID_QUERY_RE)?.[1];
  if (fromQuery) return fromQuery;
  return decoded.match(PLACE_ID_RE)?.[0] ?? null;
}

const COORDS_BANG_RE = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/;
const COORDS_AT_RE = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/;

/** Parse `gl=` / country hint from a Maps URL query when present. */
export function parseGlFromUrl(url: string): string | null {
  try {
    const href = url.trim().startsWith("http")
      ? url.trim()
      : `https://${url.trim()}`;
    const gl = new URL(href).searchParams.get("gl");
    if (gl && /^[a-zA-Z]{2}$/.test(gl)) return gl.toLowerCase();
  } catch {
    // ignore
  }
  const m = url.match(/[?&#]gl=([a-zA-Z]{2})\b/i);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Parse lat/lng from `!3d…!4d…` or `/@lat,lng` in a Maps place URL. */
export function parseCoordsFromUrl(
  url: string,
): { lat: number; lng: number } | null {
  const decoded = decodeUrl(url);
  const fromBang = decoded.match(COORDS_BANG_RE);
  if (fromBang) {
    const lat = Number(fromBang[1]);
    const lng = Number(fromBang[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const fromAt = decoded.match(COORDS_AT_RE);
  if (fromAt) {
    const lat = Number(fromAt[1]);
    const lng = Number(fromAt[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return null;
}

/** Display name slug from `/maps/place/{name}/…` when present. */
export function parsePlaceNameFromUrl(url: string): string | undefined {
  try {
    const href = url.trim().startsWith("http")
      ? url.trim()
      : `https://${url.trim()}`;
    const path = new URL(href).pathname;
    const match = path.match(/\/maps\/place\/([^/@]+)/i);
    if (!match?.[1]) return undefined;
    const name = decodeURIComponent(match[1].replace(/\+/g, " ")).trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

function isMapsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || host === "goo.gl") return true;
  if (host.startsWith("maps.")) return true;
  return MAPS_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/**
 * True when the string is a Google Maps place URL (or contains extractable
 * placeId / featureId). Used for Zod refine on advanced batch input.
 */
export function isValidGoogleMapsPlaceUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return false;
  if (parsePlaceIdFromUrl(trimmed) || parseFeatureIdFromUrl(trimmed)) {
    return true;
  }
  try {
    const href = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const u = new URL(href);
    if (!isMapsHost(u.hostname)) return false;
    const path = u.pathname.toLowerCase();
    return (
      path.includes("/maps") ||
      path.includes("/place") ||
      u.hostname.toLowerCase() === "maps.app.goo.gl" ||
      u.hostname.toLowerCase() === "goo.gl"
    );
  } catch {
    return false;
  }
}
