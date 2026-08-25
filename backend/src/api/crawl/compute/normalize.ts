import { createHash } from "node:crypto";
import { parse as parseTld } from "tldts";

import { CRAWL, CRAWL_PATTERNS } from "../constants";
import type { CRAWL_NORMALIZED_DOMAIN } from "../types";

/** Stable hash id from registrable domain. */
export function domainId(domain: string): string {
  return createHash("sha256")
    .update(domain.toLowerCase())
    .digest("hex")
    .slice(0, CRAWL.DOMAIN_ID_HEX_LEN);
}

/**
 * Normalize user input ("acme.com" | "https://www.acme.com/about") to
 * registrable domain + homepage seed.
 */
export function normalizeDomainInput(
  raw: string,
): CRAWL_NORMALIZED_DOMAIN | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const withScheme = CRAWL_PATTERNS.HAS_SCHEME.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let hostname: string;
  try {
    hostname = new URL(withScheme).hostname;
  } catch {
    return null;
  }

  const parsed = parseTld(hostname);
  const domain = parsed.domain?.toLowerCase();
  if (!domain || parsed.isIp) return null;

  return {
    domain,
    seedUrl: `https://${domain}/`,
    id: domainId(domain),
  };
}

/** Same-registrable-domain check for crawl link filtering. */
export function isSameRegistrableDomain(
  url: string,
  registrableDomain: string,
): boolean {
  try {
    const host = new URL(url).hostname;
    const d = parseTld(host).domain?.toLowerCase();
    return d === registrableDomain.toLowerCase();
  } catch {
    return false;
  }
}
