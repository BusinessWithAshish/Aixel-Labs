import { runWithConcurrency } from "../youtube/concurrency";
import {
  CRAWL,
  CRAWL_STATUS,
} from "./constants";
import { crawlDomain } from "./crawl";
import {
  domainId,
  emptyProfile,
  mergeExtracts,
  normalizeDomainInput,
} from "./compute";
import type {
  CRAWL_REQUEST_PARSED,
  CRAWL_RESPONSE,
} from "./types";

async function scrapeOne(
  raw: string,
  opts: Pick<
    CRAWL_REQUEST_PARSED,
    "maxPages" | "maxDepth" | "thorough" | "country"
  >,
): Promise<CRAWL_RESPONSE> {
  const normalized = normalizeDomainInput(raw);
  if (!normalized) {
    const fallback = raw.trim() || "unknown";
    return emptyProfile(
      domainId(fallback),
      fallback,
      CRAWL_STATUS.UPSTREAM_ERROR,
      [`Invalid domain input: ${raw}`],
    );
  }

  try {
    const crawled = await crawlDomain(normalized.domain, normalized.seedUrl, {
      maxPages: opts.maxPages,
      maxDepth: opts.maxDepth,
      thorough: opts.thorough,
      country: opts.country,
    });

    const merged = mergeExtracts(crawled.extracts);

    return {
      id: normalized.id,
      domain: normalized.domain,
      emails: merged.emails,
      phones: merged.phones,
      socials: merged.socials,
      address: merged.address,
      meta: merged.meta,
      pagesCrawled: crawled.pagesCrawled,
      status: crawled.status,
      scrapedAt: new Date().toISOString(),
      ...(crawled.errors.length > 0 ? { errors: crawled.errors } : {}),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return emptyProfile(
      normalized.id,
      normalized.domain,
      CRAWL_STATUS.UPSTREAM_ERROR,
      [msg],
    );
  }
}

/** Scrape contacts for a batch of domains with bounded concurrency. */
export async function scrapeCrawl(
  request: CRAWL_REQUEST_PARSED,
): Promise<CRAWL_RESPONSE[]> {
  const { domains, maxPages, maxDepth, thorough, country } = request;

  return runWithConcurrency(
    domains,
    CRAWL.DOMAIN_CONCURRENCY,
    (raw) => scrapeOne(raw, { maxPages, maxDepth, thorough, country }),
  );
}
