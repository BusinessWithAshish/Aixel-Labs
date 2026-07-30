import * as cheerio from "cheerio";
import type { FACEBOOK_RESPONSE } from "../types";
import {
  FACEBOOK_ABOUT_FIELD_TYPES,
  FACEBOOK_META_WEBSITE_HOST_SUFFIXES,
} from "../constants";
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

function hostMatchesSuffix(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function isExternalWebsite(url: string | null): boolean {
  if (!url) return false;
  try {
    const normalized =
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `https://${url}`;
    const host = new URL(normalized).hostname.toLowerCase();
    return !FACEBOOK_META_WEBSITE_HOST_SUFFIXES.some((s) =>
      hostMatchesSuffix(host, s),
    );
  } catch {
    return false;
  }
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  if (!isExternalWebsite(withProtocol)) return null;
  try {
    return new URL(withProtocol).href;
  } catch {
    return null;
  }
}

function decodeFbJsonString(escaped: string): string {
  try {
    return JSON.parse(`"${escaped}"`) as string;
  } catch {
    return escaped
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
        String.fromCharCode(parseInt(hex, 16)),
      )
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

type AboutFieldMap = {
  websites: string[];
  phones: string[];
  emails: string[];
  category: string | null;
  address: string | null;
};

function pushUnique(list: string[], value: string): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (list.some((x) => x.toLowerCase() === trimmed.toLowerCase())) return;
  list.push(trimmed);
}

function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Facebook About pages embed contact rows as Relay JSON:
 * `{ "text":"…", "field_type":"website"|"profile_phone"|"profile_email"|… }`.
 * Emails often use `\u0040` instead of `@`.
 */
function extractAboutFields(html: string): AboutFieldMap {
  const websites: string[] = [];
  const phones: string[] = [];
  const emails: string[] = [];
  let category: string | null = null;
  let address: string | null = null;

  const pairs: Array<{ type: string; text: string }> = [];

  const textThenType =
    /"text"\s*:\s*"((?:\\.|[^"\\])*)"[\s\S]{0,240}?"field_type"\s*:\s*"([^"]+)"/g;
  const typeThenText =
    /"field_type"\s*:\s*"([^"]+)"[\s\S]{0,240}?"text"\s*:\s*"((?:\\.|[^"\\])*)"/g;

  let m: RegExpExecArray | null;
  while ((m = textThenType.exec(html)) !== null) {
    pairs.push({ text: decodeFbJsonString(m[1]), type: m[2] });
  }
  while ((m = typeThenText.exec(html)) !== null) {
    pairs.push({ type: m[1], text: decodeFbJsonString(m[2]) });
  }

  for (const { type, text } of pairs) {
    const value = text.trim();
    if (!value) continue;

    if (
      (FACEBOOK_ABOUT_FIELD_TYPES.website as readonly string[]).includes(type)
    ) {
      const url = normalizeWebsiteUrl(value);
      if (url) pushUnique(websites, url);
      continue;
    }
    if (
      (FACEBOOK_ABOUT_FIELD_TYPES.phone as readonly string[]).includes(type)
    ) {
      pushUnique(phones, value);
      continue;
    }
    if (
      (FACEBOOK_ABOUT_FIELD_TYPES.email as readonly string[]).includes(type)
    ) {
      // `\u0040` already decoded by decodeFbJsonString; skip UI labels
      if (isPlausibleEmail(value)) pushUnique(emails, value);
      continue;
    }
    if (
      (FACEBOOK_ABOUT_FIELD_TYPES.category as readonly string[]).includes(type)
    ) {
      if (!category) category = value;
      continue;
    }
    if (
      (FACEBOOK_ABOUT_FIELD_TYPES.address as readonly string[]).includes(type)
    ) {
      if (!address) address = value;
    }
  }

  return { websites, phones, emails, category, address };
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

function pickPreferNumericId(
  a: string | null,
  b: string | null,
): string | null {
  if (a && /^\d+$/.test(a)) return a;
  if (b && /^\d+$/.test(b)) return b;
  return a ?? b;
}

function pickLongerBio(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
}

/** Merge two parses — fill nulls so /about + home/mbasic don't clobber each other. */
export function mergeFacebookLeads(
  a: FACEBOOK_RESPONSE,
  b: FACEBOOK_RESPONSE,
): FACEBOOK_RESPONSE {
  const emails = [
    ...new Set(
      [...(a.emails ?? []), ...(b.emails ?? [])]
        .map((e) => e.trim())
        .filter(isPlausibleEmail),
    ),
  ];
  return {
    id: pickPreferNumericId(a.id, b.id),
    name: a.name ?? b.name,
    facebookUrl: a.facebookUrl ?? b.facebookUrl,
    category: a.category ?? b.category,
    website: a.website ?? b.website,
    phone: a.phone ?? b.phone,
    emails: emails.length ? emails : null,
    address: a.address ?? b.address,
    followers: a.followers ?? b.followers,
    likes: a.likes ?? b.likes,
    verified: a.verified ?? b.verified,
    profileImageUrl: a.profileImageUrl ?? b.profileImageUrl,
    bio: pickLongerBio(a.bio, b.bio),
  };
}

/**
 * Thin / login-shell parses: missing page name, or name without any About
 * contact/category signals (worth retrying home + mbasic + about).
 */
export function isSparseFacebookLead(lead: FACEBOOK_RESPONSE): boolean {
  if (!lead.name) return true;
  const hasAboutSignal = Boolean(
    lead.website ||
      lead.phone ||
      (lead.emails && lead.emails.length > 0) ||
      lead.address ||
      lead.category,
  );
  return !hasAboutSignal;
}

export function preferRicherLead(
  a: FACEBOOK_RESPONSE,
  b: FACEBOOK_RESPONSE,
): FACEBOOK_RESPONSE {
  return mergeFacebookLeads(a, b);
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
  const about = extractAboutFields(html);

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

  const categoryFromText =
    text.match(/Page\s*[·•|-]\s*([^·•|\n]{2,80})/i)?.[1]?.trim() ?? null;

  const telHref = $('a[href^="tel:"]')
    .first()
    .attr("href")
    ?.replace(/^tel:/i, "")
    .trim();

  const websiteCandidates: string[] = [...about.websites];
  if (ldSameAs) {
    const url = normalizeWebsiteUrl(ldSameAs);
    if (url) websiteCandidates.push(url);
  }
  if (ldUrl) {
    const url = normalizeWebsiteUrl(ldUrl);
    if (url) websiteCandidates.push(url);
  }
  $("a[href]").each((_, el) => {
    const href = unwrapFacebookRedirect($(el).attr("href") ?? null);
    const url = href ? normalizeWebsiteUrl(href) : null;
    if (url) websiteCandidates.push(url);
  });

  const emails = new Set<string>(about.emails.filter(isPlausibleEmail));
  if (ldEmail && isPlausibleEmail(ldEmail)) emails.add(ldEmail);
  for (const e of extractEmailsFromText(html)) emails.add(e);
  $('a[href^="mailto:"]').each((_, el) => {
    const mail = $(el)
      .attr("href")
      ?.replace(/^mailto:/i, "")
      .split("?")[0]
      ?.trim();
    if (mail && isPlausibleEmail(mail)) emails.add(mail);
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

  const website = websiteCandidates.find((u) => isExternalWebsite(u)) ?? null;
  const phone = about.phones[0] ?? ldPhone ?? telHref ?? null;
  const emailList = [...emails];

  let bio = ldDesc ?? ogDesc ?? null;
  if (
    bio &&
    /log in|create new account|see more from/i.test(bio) &&
    bio.length < 80
  ) {
    bio = ldDesc ?? null;
  }

  // Generic Facebook shell titles are not page names
  const resolvedName =
    name && !/^facebook$/i.test(name.trim()) ? name : null;

  return {
    id,
    name: resolvedName,
    facebookUrl,
    category: about.category ?? categoryFromText,
    website,
    phone,
    emails: emailList.length ? emailList : null,
    address: about.address ?? ldAddress,
    followers,
    likes,
    verified: verified === true ? true : verified === false ? false : null,
    profileImageUrl: ldImage ?? ogImage,
    bio,
  };
}
