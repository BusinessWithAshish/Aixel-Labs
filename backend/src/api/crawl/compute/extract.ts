import * as cheerio from "cheerio";
import {
  findPhoneNumbersInText,
  type CountryCode,
} from "libphonenumber-js";

import { extractAllJsonLdNodes } from "../../linkedin/helpers/common";
import {
  CRAWL,
  CRAWL_EMAIL_METHOD,
  CRAWL_JSONLD_TYPES,
  CRAWL_PATTERNS,
  CRAWL_PHONE_CONFIDENCE,
} from "../constants";
import type {
  CRAWL_EMAIL,
  CRAWL_META,
  CRAWL_PAGE_EXTRACT,
  CRAWL_PHONE,
  CRAWL_SOCIALS,
} from "../types";
import {
  classifyEmailType,
  decodeCfEmail,
  deobfuscateEmailText,
  isFalsePositiveEmail,
  isSocialShareUrl,
  matchSocialHost,
  parseEmailCandidate,
} from "./filters";
import { phoneDigits, pushSocial } from "./merge";

function addEmail(
  map: Map<string, CRAWL_EMAIL>,
  raw: string,
  sourceUrl: string,
  method: CRAWL_EMAIL["method"],
): void {
  const value = parseEmailCandidate(raw);
  if (!value || isFalsePositiveEmail(value)) return;
  if (map.has(value)) return;
  map.set(value, {
    value,
    type: classifyEmailType(value),
    sourceUrl,
    method,
  });
}

function addPhone(
  map: Map<string, CRAWL_PHONE>,
  formatted: string,
  sourceUrl: string,
  confidence: CRAWL_PHONE["confidence"],
  raw?: string,
): void {
  const key = phoneDigits(formatted);
  if (!key || map.has(key)) return;
  map.set(key, { value: formatted, raw, sourceUrl, confidence });
}

function harvestEmailsFromText(
  text: string,
  sourceUrl: string,
  method: CRAWL_EMAIL["method"],
  map: Map<string, CRAWL_EMAIL>,
): void {
  const matches = text.match(CRAWL_PATTERNS.EMAIL) ?? [];
  for (const m of matches) addEmail(map, m, sourceUrl, method);
}

function extractPhonesFromText(
  text: string,
  sourceUrl: string,
  country: CountryCode | undefined,
  map: Map<string, CRAWL_PHONE>,
  confidence: CRAWL_PHONE["confidence"],
): void {
  if (!text.trim()) return;
  try {
    const matches = country
      ? findPhoneNumbersInText(text, country)
      : findPhoneNumbersInText(text);
    for (const { number } of matches) {
      if (!number.isValid()) continue;
      addPhone(map, number.formatInternational(), sourceUrl, confidence);
    }
  } catch {
    // ignore parse errors
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function typeIncludes(node: Record<string, unknown>, name: string): boolean {
  const t = node["@type"];
  if (typeof t === "string") {
    return t.toLowerCase().includes(name.toLowerCase());
  }
  if (Array.isArray(t)) {
    return t.some(
      (x) =>
        typeof x === "string" && x.toLowerCase().includes(name.toLowerCase()),
    );
  }
  return false;
}

function formatPostalAddress(addr: unknown): string | undefined {
  const o = asRecord(addr);
  if (!o) return typeof addr === "string" ? addr : undefined;
  const parts = [
    o.streetAddress,
    o.addressLocality,
    o.addressRegion,
    o.postalCode,
    o.addressCountry,
  ]
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function harvestJsonLd(
  $: cheerio.CheerioAPI,
  sourceUrl: string,
  emails: Map<string, CRAWL_EMAIL>,
  phones: Map<string, CRAWL_PHONE>,
  socials: CRAWL_SOCIALS,
  country: CountryCode | undefined,
): string | undefined {
  let address: string | undefined;
  for (const node of extractAllJsonLdNodes($)) {
    const obj = asRecord(node);
    if (!obj) continue;

    const interesting = CRAWL_JSONLD_TYPES.some((t) =>
      typeIncludes(obj, t),
    );

    if (typeof obj.email === "string") {
      addEmail(emails, obj.email, sourceUrl, CRAWL_EMAIL_METHOD.JSONLD);
    }
    if (typeof obj.telephone === "string") {
      extractPhonesFromText(
        obj.telephone,
        sourceUrl,
        country,
        phones,
        CRAWL_PHONE_CONFIDENCE.HIGH,
      );
    }

    const sameAs = obj.sameAs;
    const sameList = Array.isArray(sameAs)
      ? sameAs
      : typeof sameAs === "string"
        ? [sameAs]
        : [];
    for (const s of sameList) {
      if (typeof s !== "string" || isSocialShareUrl(s)) continue;
      const key = matchSocialHost(s);
      if (key) pushSocial(socials, key, s.split("?")[0]!);
    }

    if (!address && obj.address) {
      address = formatPostalAddress(obj.address);
    }

    const contactPoints = obj.contactPoint;
    const cps = Array.isArray(contactPoints)
      ? contactPoints
      : contactPoints
        ? [contactPoints]
        : [];
    for (const cp of cps) {
      const c = asRecord(cp);
      if (!c) continue;
      if (typeof c.email === "string") {
        addEmail(emails, c.email, sourceUrl, CRAWL_EMAIL_METHOD.JSONLD);
      }
      if (typeof c.telephone === "string") {
        extractPhonesFromText(
          c.telephone,
          sourceUrl,
          country,
          phones,
          CRAWL_PHONE_CONFIDENCE.HIGH,
        );
      }
    }

    if (!interesting && !obj.email && !obj.telephone && !obj.sameAs) continue;
  }
  return address;
}

/** Extract contacts + same-site links from one HTML page. */
export function extractFromHtml(
  html: string,
  pageUrl: string,
  options: { country?: string; registrableDomain?: string } = {},
): CRAWL_PAGE_EXTRACT {
  const $ = cheerio.load(html);
  const country = options.country as CountryCode | undefined;

  const emails = new Map<string, CRAWL_EMAIL>();
  const phones = new Map<string, CRAWL_PHONE>();
  const socials: CRAWL_SOCIALS = {};
  const linkSet = new Set<string>();

  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      addEmail(emails, href, pageUrl, CRAWL_EMAIL_METHOD.MAILTO);
    }
  });

  $(".__cf_email__, [data-cfemail]").each((_, el) => {
    const hex = $(el).attr("data-cfemail");
    if (!hex) return;
    const decoded = decodeCfEmail(hex);
    if (decoded) {
      addEmail(emails, decoded, pageUrl, CRAWL_EMAIL_METHOD.CFEMAIL);
    }
  });
  $('a[href*="/cdn-cgi/l/email-protection"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const hash = href.split("#")[1];
    if (!hash) return;
    const decoded = decodeCfEmail(hash);
    if (decoded) {
      addEmail(emails, decoded, pageUrl, CRAWL_EMAIL_METHOD.CFEMAIL);
    }
  });

  $('a[href^="tel:"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const raw = href.replace(/^tel:/i, "").trim();
    if (!raw) return;
    extractPhonesFromText(
      raw,
      pageUrl,
      country,
      phones,
      CRAWL_PHONE_CONFIDENCE.HIGH,
    );
    if (
      ![...phones.values()].some((p) => p.raw === raw || p.value.includes(raw))
    ) {
      const digits = phoneDigits(raw);
      if (digits.length >= CRAWL.MIN_TEL_DIGITS) {
        addPhone(
          phones,
          raw,
          pageUrl,
          CRAWL_PHONE_CONFIDENCE.MEDIUM,
          raw,
        );
      }
    }
  });

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      return;
    }

    if (!isSocialShareUrl(absolute)) {
      const key = matchSocialHost(absolute);
      if (key) {
        pushSocial(socials, key, absolute.split("?")[0]!);
        return;
      }
    }

    linkSet.add(absolute.split("#")[0]!);
  });

  const address = harvestJsonLd($, pageUrl, emails, phones, socials, country);

  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ");
  harvestEmailsFromText(
    bodyText,
    pageUrl,
    CRAWL_EMAIL_METHOD.REGEX,
    emails,
  );
  const deob = deobfuscateEmailText(bodyText);
  if (deob !== bodyText) {
    harvestEmailsFromText(
      deob,
      pageUrl,
      CRAWL_EMAIL_METHOD.OBFUSCATED,
      emails,
    );
  }
  extractPhonesFromText(
    bodyText,
    pageUrl,
    country,
    phones,
    CRAWL_PHONE_CONFIDENCE.MEDIUM,
  );

  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    undefined;
  const description =
    $('meta[property="og:description"]').attr("content")?.trim() ||
    $('meta[name="description"]').attr("content")?.trim() ||
    undefined;
  const siteName =
    $('meta[property="og:site_name"]').attr("content")?.trim() || undefined;

  const meta: CRAWL_META | undefined =
    title || description || siteName
      ? { title, description, siteName }
      : undefined;

  return {
    emails: [...emails.values()],
    phones: [...phones.values()],
    socials,
    address,
    meta,
    links: [...linkSet],
  };
}
