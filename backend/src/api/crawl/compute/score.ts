import {
  CRAWL,
  CRAWL_PATTERNS,
  CRAWL_PRIORITY_KEYWORDS,
  CRAWL_SKIP_PATH_SEGMENTS,
} from "../constants";
import { isSameRegistrableDomain } from "./normalize";

export function scoreUrl(url: string): number {
  let path: string;
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return 0;
  }
  const segments = path.split("/").filter(Boolean);
  if (
    segments.some((s) =>
      (CRAWL_SKIP_PATH_SEGMENTS as readonly string[]).includes(s),
    )
  ) {
    return CRAWL.SKIP_PATH_SCORE;
  }
  let score = 0;
  for (const kw of CRAWL_PRIORITY_KEYWORDS) {
    if (path.includes(kw)) score += CRAWL.PRIORITY_KEYWORD_SCORE;
  }
  if (path === "/" || path === "") score += CRAWL.HOMEPAGE_SCORE;
  if (segments.length <= 2 && score > 0) {
    score += CRAWL.SHORT_PATH_BONUS;
  }
  return score;
}

export function shouldSkipUrl(url: string, domain: string): boolean {
  if (!isSameRegistrableDomain(url, domain)) return true;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const path = u.pathname.toLowerCase();
    const segments = path.split("/").filter(Boolean);
    if (
      segments.some((s) =>
        (CRAWL_SKIP_PATH_SEGMENTS as readonly string[]).includes(s),
      )
    ) {
      return true;
    }
    if (CRAWL_PATTERNS.ASSET_EXT.test(path)) return true;
  } catch {
    return true;
  }
  return false;
}
