import * as cheerio from "cheerio";

/** Grab normalised text from the first matched element, or null. */
export const txt = ($el: cheerio.Cheerio<any>): string | null =>
  $el.length ? $el.text().replace(/\s+/g, " ").trim() || null : null;

/** Grab an attribute value, or null. */
export const attr = ($el: cheerio.Cheerio<any>, name: string): string | null =>
  $el.length ? ($el.attr(name) ?? null) : null;

/** Parse a human-readable number string ("5,381 employees" → 5381). */
export const safeInt = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
  return isNaN(n) ? null : n;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function jsonLdTypeMatches(nodeType: unknown, want: string): boolean {
  if (nodeType === want) return true;
  if (Array.isArray(nodeType)) return nodeType.includes(want);
  return false;
}

export function ldString(
  node: Record<string, unknown>,
  key: string,
): string | null {
  const value = node[key];
  return typeof value === "string" && value ? value : null;
}

export function filterJsonLdNodesByType(
  nodes: unknown[],
  type: string,
): Record<string, unknown>[] {
  return nodes.filter(
    (n): n is Record<string, unknown> =>
      isRecord(n) && jsonLdTypeMatches(n["@type"], type),
  );
}

export function sortJsonLdNodesByDateDesc(
  nodes: Record<string, unknown>[],
  dateKey = "datePublished",
): Record<string, unknown>[] {
  return [...nodes].sort((a, b) =>
    String(b[dateKey] ?? "").localeCompare(String(a[dateKey] ?? "")),
  );
}

export function extractJsonLdMapped<T>(
  nodes: unknown[],
  type: string,
  map: (node: Record<string, unknown>) => T,
  options?: {
    sortByDate?: boolean;
    predicate?: (node: Record<string, unknown>) => boolean;
  },
): T[] {
  let matched = filterJsonLdNodesByType(nodes, type);
  if (options?.predicate) matched = matched.filter(options.predicate);
  if (options?.sortByDate) matched = sortJsonLdNodesByDateDesc(matched);
  return matched.map(map);
}

export function forEachJsonLdRecord(
  items: unknown,
  fn: (entry: Record<string, unknown>) => void,
): void {
  if (!Array.isArray(items)) return;
  for (const item of items) {
    if (isRecord(item)) fn(item);
  }
}

export function normalizeLdDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

export function parseJsonLdImageUrl(image: unknown): string | null {
  if (typeof image === "string") return image;
  if (isRecord(image)) {
    const url = image.url ?? image.contentUrl;
    return typeof url === "string" ? url : null;
  }
  return null;
}

export function parseInteractionLikeCount(stat: unknown): number | null {
  if (!isRecord(stat)) return null;
  const count = stat.userInteractionCount;
  if (typeof count === "number" && Number.isFinite(count)) return count;
  if (typeof count === "string") return safeInt(count);
  return null;
}

export function normalizeStringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = raw.filter((x): x is string => typeof x === "string");
  return out.length ? out : null;
}

export function linkedInProfileSlugFromUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const inIdx = segments.indexOf("in");
    if (inIdx >= 0 && segments[inIdx + 1]) return segments[inIdx + 1];
    return segments[segments.length - 1] ?? null;
  } catch {
    return null;
  }
}

/** Collapse `/in/{slug}/…` SERP variants to the canonical profile URL for fetching & deduping. */
export function canonicalLinkedInProfileUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!u.hostname.toLowerCase().endsWith("linkedin.com")) return null;
    const segments = u.pathname.split("/").filter(Boolean);
    const inIdx = segments.indexOf("in");
    if (inIdx < 0 || !segments[inIdx + 1]) return null;
    return `${u.origin}/in/${segments[inIdx + 1]}/`;
  } catch {
    return null;
  }
}

export function isLinkedInMediaSrc(
  src: string | null,
  pathFragment: string,
): boolean {
  return !!src && src.includes("media.licdn.com") && src.includes(pathFragment);
}

/**
 * Collect every node from every ld+json <script> tag on the page.
 * LinkedIn spreads data across multiple tags and @graph arrays.
 */
export const extractAllJsonLdNodes = ($: cheerio.CheerioAPI): unknown[] => {
  const all: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const raw = $(el).html();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const nodes: unknown[] = parsed?.["@graph"]
        ? parsed["@graph"]
        : Array.isArray(parsed)
          ? parsed
          : [parsed];
      all.push(...nodes);
    } catch {
      // skip malformed scripts
    }
  });
  return all;
};
