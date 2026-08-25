import {
  CRAWL_EMPTY_SOCIALS,
  CRAWL_STATUS,
} from "../constants";
import type {
  CRAWL_MERGED_EXTRACT,
  CRAWL_META,
  CRAWL_PAGE_EXTRACT,
  CRAWL_RESPONSE,
  CRAWL_SOCIALS,
  CRAWL_STATUS_VALUE,
} from "../types";

export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function pushSocial(
  socials: CRAWL_SOCIALS,
  key: keyof CRAWL_SOCIALS,
  href: string,
): void {
  const list = socials[key] ?? [];
  if (!list.includes(href)) list.push(href);
  socials[key] = list;
}

export function hasCoreContacts(extract: {
  emails: { length: number };
  phones: { length: number };
  socials: CRAWL_SOCIALS;
}): boolean {
  const hasSocial = Object.values(extract.socials).some(
    (arr) => Array.isArray(arr) && arr.length > 0,
  );
  return extract.emails.length > 0 && extract.phones.length > 0 && hasSocial;
}

export function mergeExtracts(
  pages: CRAWL_PAGE_EXTRACT[],
): CRAWL_MERGED_EXTRACT {
  const emailMap = new Map<
    string,
    CRAWL_PAGE_EXTRACT["emails"][number]
  >();
  const phoneMap = new Map<
    string,
    CRAWL_PAGE_EXTRACT["phones"][number]
  >();
  const socials: CRAWL_SOCIALS = {};
  let address: string | undefined;
  let meta: CRAWL_META | undefined;

  for (const p of pages) {
    for (const e of p.emails) {
      if (!emailMap.has(e.value)) emailMap.set(e.value, e);
    }
    for (const ph of p.phones) {
      const key = phoneDigits(ph.value);
      if (!phoneMap.has(key)) phoneMap.set(key, ph);
    }
    for (const [k, urls] of Object.entries(p.socials) as [
      keyof CRAWL_SOCIALS,
      string[] | undefined,
    ][]) {
      if (!urls) continue;
      for (const u of urls) pushSocial(socials, k, u);
    }
    if (!address && p.address) address = p.address;
    if (!meta && p.meta) meta = p.meta;
    else if (meta && p.meta) {
      meta = {
        title: meta.title ?? p.meta.title,
        description: meta.description ?? p.meta.description,
        siteName: meta.siteName ?? p.meta.siteName,
      };
    }
  }

  return {
    emails: [...emailMap.values()],
    phones: [...phoneMap.values()],
    socials,
    address,
    meta,
  };
}

export function emptyProfile(
  id: string,
  domain: string,
  status: CRAWL_STATUS_VALUE = CRAWL_STATUS.UPSTREAM_ERROR,
  errors?: string[],
): CRAWL_RESPONSE {
  return {
    id,
    domain,
    emails: [],
    phones: [],
    socials: { ...CRAWL_EMPTY_SOCIALS },
    pagesCrawled: [],
    status,
    scrapedAt: new Date().toISOString(),
    ...(errors?.length ? { errors } : {}),
  };
}
