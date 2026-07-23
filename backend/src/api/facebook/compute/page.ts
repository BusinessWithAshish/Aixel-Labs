import {
  FACEBOOK_BASE_URL,
  FACEBOOK_MBASIC_BASE_URL,
  FACEBOOK_RESERVED_FIRST_SEGMENT_SET,
  FACEBOOK_SITE_HOST,
  FACEBOOK_VANITY_REGEX,
} from "../constants";

function isFacebookHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(FACEBOOK_SITE_HOST);
  } catch {
    return false;
  }
}

function looksLikeUrl(input: string): boolean {
  return (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.includes(FACEBOOK_SITE_HOST)
  );
}

/**
 * Extract a Facebook Page vanity slug from a URL or bare name.
 * Rejects reserved site sections (groups, people, posts, etc.).
 */
export function extractPageVanity(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (looksLikeUrl(trimmed)) {
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
      );
      if (!isFacebookHost(url.href)) return null;

      // Numeric profile.php IDs are usually personal profiles — skip.
      if (url.pathname.toLowerCase().includes("profile.php")) {
        return null;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;

      const first = parts[0].toLowerCase();

      // Modern Pages: /p/{Name-ID}/ — keep path prefix so about URLs resolve.
      if (first === "p" && parts[1]) {
        const slug = decodeURIComponent(parts[1]).replace(/\/+$/, "");
        if (!FACEBOOK_VANITY_REGEX.test(slug)) return null;
        return `p/${slug}`;
      }

      // Legacy /pg/{vanity} or /pages/{category}/{vanity}
      let candidate = parts[0];
      if (first === "pg" && parts[1]) {
        candidate = parts[1];
      } else if (first === "pages" && parts.length >= 3) {
        candidate = parts[parts.length - 1];
      }

      const lower = candidate.toLowerCase();
      if (FACEBOOK_RESERVED_FIRST_SEGMENT_SET.has(lower)) {
        return null;
      }
      // Strip query-ish suffixes and decode
      const decoded = decodeURIComponent(candidate).replace(/\/+$/, "");
      if (!FACEBOOK_VANITY_REGEX.test(decoded)) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  const bare = trimmed.replace(/^@/, "");
  if (!FACEBOOK_VANITY_REGEX.test(bare)) return null;
  if (FACEBOOK_RESERVED_FIRST_SEGMENT_SET.has(bare.toLowerCase())) return null;
  return bare;
}

export function uniquePageVanities(entities: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entities) {
    if (raw === null) continue;
    const v = extractPageVanity(raw);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export function facebookPageUrl(vanity: string): string {
  const path = vanity.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${FACEBOOK_BASE_URL}/${path}/`;
}

export function facebookMbasicPageUrl(vanity: string): string {
  const path = vanity.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${FACEBOOK_MBASIC_BASE_URL}/${path}`;
}

export function facebookAboutUrl(vanity: string): string {
  const path = vanity.replace(/^\/+/, "").replace(/\/+$/, "");
  return `${FACEBOOK_BASE_URL}/${path}/about`;
}

export const hasEntities = (entities: string[] | undefined) =>
  Array.isArray(entities) && entities.length > 0;

export const hasQuery = (q: string | undefined) =>
  typeof q === "string" && q.trim().length > 0;
