import * as cheerio from "cheerio";
import type { FACEBOOK_RESPONSE } from "../types";
import { extractPageVanity, facebookPageUrl } from "./page";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function ldString(
  node: Record<string, unknown>,
  key: string,
): string | null {
  const value = node[key];
  return typeof value === "string" && value ? value : null;
}

function jsonLdTypeMatches(nodeType: unknown, want: string): boolean {
  if (nodeType === want) return true;
  if (Array.isArray(nodeType)) return nodeType.includes(want);
  return false;
}

function extractAllJsonLdNodes($: cheerio.CheerioAPI): unknown[] {
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
      // skip malformed
    }
  });
  return all;
}

const BUSINESS_JSON_LD_TYPES = [
  "Organization",
  "LocalBusiness",
  "Corporation",
  "Restaurant",
  "Store",
  "Place",
  "Brand",
];

function findBusinessNode(
  nodes: unknown[],
): Record<string, unknown> | null {
  for (const type of BUSINESS_JSON_LD_TYPES) {
    const match = nodes.find(
      (n): n is Record<string, unknown> =>
        isRecord(n) && jsonLdTypeMatches(n["@type"], type),
    );
    if (match) return match;
  }
  return null;
}

function safeInt(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  const m = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) {
    const n = parseInt(cleaned.replace(/[^0-9]/g, ""), 10);
    return Number.isNaN(n) ? null : n;
  }
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const suffix = (m[2] ?? "").toUpperCase();
  if (suffix === "K") n *= 1_000;
  if (suffix === "M") n *= 1_000_000;
  if (suffix === "B") n *= 1_000_000_000;
  return Math.round(n);
}

function metaContent(
  $: cheerio.CheerioAPI,
  ...selectors: string[]
): string | null {
  for (const sel of selectors) {
    const content = $(sel).attr("content")?.trim();
    if (content) return content;
  }
  return null;
}

function unwrapFacebookRedirect(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, "https://www.facebook.com");
    if (
      u.hostname.includes("facebook.com") &&
      (u.pathname === "/l.php" || u.pathname.endsWith("/l.php"))
    ) {
      const target = u.searchParams.get("u");
      if (target) return decodeURIComponent(target);
    }
    return u.href;
  } catch {
    return href;
  }
}

function isExternalWebsite(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !host.endsWith("facebook.com") && !host.endsWith("fb.com");
  } catch {
    return false;
  }
}

function extractEmailsFromText(text: string): string[] {
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const found = text.match(re) ?? [];
  const blocked = new Set([
    "example.com",
    "facebook.com",
    "fb.com",
    "meta.com",
    "sentry.io",
  ]);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const email of found) {
    const lower = email.toLowerCase();
    const domain = lower.split("@")[1] ?? "";
    if (blocked.has(domain) || seen.has(lower)) continue;
    if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(lower)) continue;
    seen.add(lower);
    out.push(email);
  }
  return out;
}

function formatAddress(addr: unknown): string | null {
  if (typeof addr === "string" && addr.trim()) return addr.trim();
  if (!isRecord(addr)) return null;
  const parts = [
    ldString(addr, "streetAddress"),
    ldString(addr, "addressLocality"),
    ldString(addr, "addressRegion"),
    ldString(addr, "postalCode"),
    ldString(addr, "addressCountry"),
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : null;
}

function parseCountNearLabel(html: string, label: RegExp): number | null {
  // e.g. "34M followers", "34,000,000 followers", "Liked by 1.2M"
  const re = new RegExp(
    `([\\d,.]+\\s*[KMB]?)\\s*${label.source}`,
    "i",
  );
  const m = html.match(re);
  if (m) return safeInt(m[1]);
  const re2 = new RegExp(
    `${label.source}[^\\d]{0,20}([\\d,.]+\\s*[KMB]?)`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? safeInt(m2[1]) : null;
}

function extractPageId($: cheerio.CheerioAPI, html: string): string | null {
  const patterns = [
    /"pageID"\s*:\s*"(\d+)"/,
    /"page_id"\s*:\s*"(\d+)"/,
    /"entity_id"\s*:\s*"(\d+)"/,
    /fb:\/\/page\/\?id=(\d+)/,
    /content="fb:\/\/page\/\?id=(\d+)"/,
    /"pageID"\s*:\s*(\d+)/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  const al = $('meta[property="al:android:url"]').attr("content");
  if (al) {
    const m = al.match(/id[=:](\d+)/i);
    if (m?.[1]) return m[1];
  }
  return null;
}

function scoreRichness(lead: FACEBOOK_RESPONSE): number {
  let s = 0;
  if (lead.id) s += 2;
  if (lead.name) s += 2;
  if (lead.facebookUrl) s += 1;
  if (lead.category) s += 1;
  if (lead.website) s += 2;
  if (lead.phone) s += 2;
  if (lead.emails?.length) s += 2;
  if (lead.address) s += 1;
  if (lead.followers != null) s += 1;
  if (lead.likes != null) s += 1;
  if (lead.bio) s += 1;
  if (lead.profileImageUrl) s += 1;
  return s;
}

export function isSparseFacebookLead(lead: FACEBOOK_RESPONSE): boolean {
  return !lead.name && !lead.id;
}

export function preferRicherLead(
  a: FACEBOOK_RESPONSE,
  b: FACEBOOK_RESPONSE,
): FACEBOOK_RESPONSE {
  return scoreRichness(b) > scoreRichness(a) ? b : a;
}

/**
 * Parse public Facebook Page HTML (www or mbasic) into a lead shape.
 */
export function mapFacebookPageHtml(
  html: string,
  pageUrlHint?: string,
): FACEBOOK_RESPONSE {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ");

  const jsonLdNodes = extractAllJsonLdNodes($);
  const business = findBusinessNode(jsonLdNodes);

  const ogTitle = metaContent(
    $,
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  );
  const ogDesc = metaContent(
    $,
    'meta[property="og:description"]',
    'meta[name="description"]',
  );
  const ogImage = metaContent(
    $,
    'meta[property="og:image"]',
    'meta[name="twitter:image"]',
  );
  const ogUrl = metaContent($, 'meta[property="og:url"]');

  const ldName = business ? ldString(business, "name") : null;
  const ldDesc = business ? ldString(business, "description") : null;
  const ldUrl = business ? ldString(business, "url") : null;
  const ldPhone = business ? ldString(business, "telephone") : null;
  const ldEmail = business ? ldString(business, "email") : null;
  const ldSameAs = business ? ldString(business, "sameAs") : null;
  const ldImage =
    business && isRecord(business.image)
      ? ldString(business.image, "url") ?? ldString(business.image, "contentUrl")
      : business && typeof business.image === "string"
        ? business.image
        : null;
  const ldAddress = business ? formatAddress(business.address) : null;

  // Category: often in intro / about text "Page · Food and drink company"
  const categoryFromText =
    text.match(/Page\s*[·•|-]\s*([^·•|\n]{2,80})/i)?.[1]?.trim() ?? null;

  // Phone from tel: links
  const telHref = $('a[href^="tel:"]')
    .first()
    .attr("href")
    ?.replace(/^tel:/i, "")
    .trim();

  // Website candidates
  const websiteCandidates: string[] = [];
  if (ldSameAs && isExternalWebsite(ldSameAs)) {
    websiteCandidates.push(ldSameAs);
  }
  if (ldUrl && isExternalWebsite(ldUrl)) {
    websiteCandidates.push(ldUrl);
  }
  $("a[href]").each((_, el) => {
    const href = unwrapFacebookRedirect($(el).attr("href") ?? null);
    if (href && isExternalWebsite(href)) {
      websiteCandidates.push(href);
    }
  });

  const emails = new Set<string>();
  if (ldEmail) emails.add(ldEmail);
  for (const e of extractEmailsFromText(html)) emails.add(e);
  $('a[href^="mailto:"]').each((_, el) => {
    const mail = $(el)
      .attr("href")
      ?.replace(/^mailto:/i, "")
      .split("?")[0]
      ?.trim();
    if (mail) emails.add(mail);
  });

  const followers =
    parseCountNearLabel(text, /followers?/i) ??
    parseCountNearLabel(html, /followers?/i);
  const likes =
    parseCountNearLabel(text, /likes?/i) ??
    parseCountNearLabel(html, /likes?/i);

  const verified =
    /Verified account/i.test(text) ||
    $('img[alt*="Verified"]').length > 0 ||
    $('[aria-label*="Verified"]').length > 0 ||
    null;

  const vanityFromUrl =
    extractPageVanity(ogUrl ?? "") ??
    extractPageVanity(pageUrlHint ?? "") ??
    extractPageVanity(ldUrl ?? "");

  const pageId = extractPageId($, html);
  const id = pageId ?? (vanityFromUrl ? vanityFromUrl.toLowerCase() : null);

  const h1Name = $("h1").first().text().replace(/\s+/g, " ").trim();
  const name =
    ldName ??
    ogTitle?.replace(/\s*\|\s*Facebook\s*$/i, "").trim() ??
    (h1Name || null);

  const facebookUrl = vanityFromUrl
    ? facebookPageUrl(vanityFromUrl)
    : ogUrl && ogUrl.includes("facebook.com")
      ? ogUrl
      : pageUrlHint && pageUrlHint.includes("facebook.com")
        ? pageUrlHint
        : null;

  const website = websiteCandidates.find(isExternalWebsite) ?? null;
  const phone = ldPhone ?? telHref ?? null;
  const emailList = [...emails];

  // Strip login-wall boilerplate from bio when possible
  let bio = ldDesc ?? ogDesc ?? null;
  if (
    bio &&
    /log in|create new account|see more from/i.test(bio) &&
    bio.length < 80
  ) {
    bio = ldDesc ?? null;
  }

  return {
    id,
    name: name || null,
    facebookUrl,
    category: categoryFromText,
    website,
    phone,
    emails: emailList.length ? emailList : null,
    address: ldAddress,
    followers,
    likes,
    verified: verified === true ? true : verified === false ? false : null,
    profileImageUrl: ldImage ?? ogImage,
    bio,
  };
}
