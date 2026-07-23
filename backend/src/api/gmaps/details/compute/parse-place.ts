import { GMAPS_DETAILS_FIELDS } from "../constants";

/** Safely dig nested array indices. */
export const dig = (obj: unknown, path: readonly number[]): unknown => {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<number, unknown>)[k];
  }
  return cur;
};

export const asString = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;

export const asNumber = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

export const asStringArray = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0);
  return out.length ? out : null;
};

/** Place card is always `response[6]` for `/maps/preview/place`. */
export function extractPlaceObject(data: unknown): unknown[] | null {
  if (!Array.isArray(data)) return null;
  const p = data[6];
  return Array.isArray(p) ? p : null;
}

export function extractRating(p: unknown[]): number | null {
  const p4 = p[GMAPS_DETAILS_FIELDS.RATING_BLOCK];
  if (!Array.isArray(p4)) return null;
  const val = p4[GMAPS_DETAILS_FIELDS.RATING];
  return typeof val === "number" && val >= 1.0 && val <= 5.0 ? val : null;
}

export function extractReviewCount(p: unknown[]): number | null {
  const p4 = p[GMAPS_DETAILS_FIELDS.RATING_BLOCK];
  if (!Array.isArray(p4)) return null;
  const val = p4[GMAPS_DETAILS_FIELDS.REVIEW_COUNT];
  const direct = parseReviewValue(val);
  if (direct != null) return direct;

  // Fallback: reviews text at p[4][3][1] e.g. "15,222 reviews"
  const fromText = parseReviewValue(
    Array.isArray(p4[3]) ? p4[3][1] : undefined,
  );
  if (fromText != null) return fromText;

  // Scan p[4] for a plausible integer count (not the 1–5 rating)
  for (const cell of p4) {
    if (typeof cell === "number" && Number.isInteger(cell) && cell > 5) {
      return cell;
    }
  }
  return null;
}

/** Same formats as `/gmaps/internal` `parseReviewValue`. */
function parseReviewValue(val: unknown): number | null {
  if (typeof val === "number" && Number.isInteger(val) && val > 0) return val;
  if (typeof val !== "string") return null;
  const cleaned = val.replace(/[(),\s]/g, "").replace(/reviews?$/i, "");
  const kMatch = cleaned.match(/^(\d+(?:\.\d+)?)K$/i);
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
  const mMatch = cleaned.match(/^(\d+(?:\.\d+)?)M$/i);
  if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1_000_000);
  const numMatch = cleaned.match(/^(\d+)/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return null;
}

/** Collect googleusercontent / streetview photo URLs from a subtree. */
export function collectPhotoUrls(node: unknown, out: string[] = [], depth = 0): string[] {
  if (out.length >= 40 || depth > 10) return out;
  if (typeof node === "string") {
    if (
      (node.includes("googleusercontent.com") ||
        node.includes("streetviewpixels")) &&
      !out.includes(node)
    ) {
      out.push(node);
    }
    return out;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectPhotoUrls(x, out, depth + 1);
  }
  return out;
}

/** Walk tree collecting strings matching a predicate. */
export function collectStrings(
  node: unknown,
  pred: (s: string) => boolean,
  out: string[] = [],
  depth = 0,
): string[] {
  if (out.length >= 60 || depth > 12) return out;
  if (typeof node === "string") {
    if (pred(node)) out.push(node);
    return out;
  }
  if (Array.isArray(node)) {
    for (const x of node) collectStrings(x, pred, out, depth + 1);
  }
  return out;
}
