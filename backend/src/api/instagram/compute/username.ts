import {
  INSTAGRAM_BASE_URL,
  INSTAGRAM_RESERVED_FIRST_SEGMENT_SET,
  INSTAGRAM_SITE_HOST,
} from "../constants";

function isInstagramHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(INSTAGRAM_SITE_HOST);
  } catch {
    return false;
  }
}

/** URL-shaped input: absolute URL or hostname path containing `instagram.com`. */
function looksLikeUrl(input: string): boolean {
  return (
    input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.includes(INSTAGRAM_SITE_HOST)
  );
}

/**
 * Single extractor for Instagram handles used with `web_profile_info`:
 * - URL-like input: must be `*.instagram.com` with profile-style path
 *   (`/${username}`, `/${username}/…`); rejects `/p/`, `/reel/`, `/explore/`, etc.
 * - Plain input: treated as a bare handle (leading `@` stripped).
 */
export function extractUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (looksLikeUrl(trimmed)) {
    try {
      const url = new URL(
        trimmed.startsWith("http") ? trimmed : `https://${trimmed}`,
      );
      if (!isInstagramHost(url.href)) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      const candidate = parts[0];
      if (
        !candidate ||
        INSTAGRAM_RESERVED_FIRST_SEGMENT_SET.has(candidate.toLowerCase())
      ) {
        return null;
      }
      return candidate;
    } catch {
      return null;
    }
  }

  return trimmed.replace(/^@/, "") || null;
}

export function uniqueUsernames(entities: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of entities) {
    if (raw === null) continue;
    const u = extractUsername(raw);
    if (!u) continue;
    const k = u.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

export function instagramProfileUrl(username: string): string {
  return `${INSTAGRAM_BASE_URL}/${username}/`;
}

export const hasEntities = (entities: string[] | undefined) =>
  Array.isArray(entities) && entities.length > 0;

export const hasQuery = (q: string | undefined) =>
  typeof q === "string" && q.trim().length > 0;
