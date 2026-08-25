import disposableDomains from "disposable-email-domains";
import addrs from "email-addresses";
import { parse as parseTld } from "tldts";

import {
  CRAWL_EMAIL_FP_LOCAL_PARTS,
  CRAWL_EMAIL_FP_PATTERNS,
  CRAWL_EMAIL_TYPE,
  CRAWL_GENERIC_EMAIL_LOCAL,
  CRAWL_SOCIAL_HOSTS,
  CRAWL_SOCIAL_SHARE_PATTERNS,
  type CRAWL_SOCIAL_KEY,
} from "../constants";
import type { CRAWL_EMAIL_TYPE_VALUE } from "../types";

const disposableSet = new Set(
  (disposableDomains as string[]).map((d) => d.toLowerCase()),
);

/** Parse + normalize a candidate email; null if invalid. */
export function parseEmailCandidate(raw: string): string | null {
  const cleaned = raw.trim().replace(/^mailto:/i, "").split("?")[0]?.trim();
  if (!cleaned) return null;
  const parsed = addrs.parseOneAddress(cleaned);
  if (!parsed || parsed.type !== "mailbox") return null;
  const address = parsed.address?.toLowerCase();
  if (!address || !address.includes("@")) return null;
  return address;
}

export function isFalsePositiveEmail(email: string): boolean {
  const lower = email.toLowerCase();
  for (const pat of CRAWL_EMAIL_FP_PATTERNS) {
    if (pat.test(lower)) return true;
  }
  const [local, domain] = lower.split("@");
  if (!local || !domain) return true;
  if (
    (
      CRAWL_EMAIL_FP_LOCAL_PARTS as readonly string[]
    ).includes(local)
  ) {
    return true;
  }
  if (disposableSet.has(domain)) return true;
  if (local.length > 64 || domain.length > 253) return true;
  const tld = parseTld(domain);
  if (!tld.publicSuffix || !tld.domain || tld.isIp || tld.isIcann === false) {
    return true;
  }
  return false;
}

export function classifyEmailType(
  email: string,
): CRAWL_EMAIL_TYPE_VALUE {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (
    (CRAWL_GENERIC_EMAIL_LOCAL as readonly string[]).includes(local)
  ) {
    return CRAWL_EMAIL_TYPE.GENERIC;
  }
  if (local.includes(".") || local.includes("_")) {
    return CRAWL_EMAIL_TYPE.PERSONAL;
  }
  return CRAWL_EMAIL_TYPE.UNKNOWN;
}

export function isSocialShareUrl(href: string): boolean {
  return CRAWL_SOCIAL_SHARE_PATTERNS.some((p) => p.test(href));
}

/** Map URL hostname to social key, or null. */
export function matchSocialHost(href: string): CRAWL_SOCIAL_KEY | null {
  let host: string;
  try {
    host = new URL(href).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [key, hosts] of Object.entries(CRAWL_SOCIAL_HOSTS) as [
    CRAWL_SOCIAL_KEY,
    readonly string[],
  ][]) {
    if (hosts.some((h) => host === h || host.endsWith(`.${h}`))) {
      return key;
    }
  }
  return null;
}

/** Decode Cloudflare Scrape Shield `data-cfemail` hex. */
export function decodeCfEmail(encoded: string): string | null {
  try {
    const key = parseInt(encoded.slice(0, 2), 16);
    if (!Number.isFinite(key)) return null;
    let out = "";
    for (let i = 2; i < encoded.length; i += 2) {
      const byte = parseInt(encoded.slice(i, i + 2), 16);
      if (!Number.isFinite(byte)) return null;
      out += String.fromCharCode(byte ^ key);
    }
    return out;
  } catch {
    return null;
  }
}

/** Normalize common obfuscations: name [at] domain [dot] com */
export function deobfuscateEmailText(text: string): string {
  return text
    .replace(/\s*[\[({]\s*(?:at|AT)\s*[\])}]\s*/g, "@")
    .replace(/\s*[\[({]\s*(?:dot|DOT)\s*[\])}]\s*/g, ".")
    .replace(/\s+at\s+/gi, "@")
    .replace(/\s+dot\s+/gi, ".");
}
