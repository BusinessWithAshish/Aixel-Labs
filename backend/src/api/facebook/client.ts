import { fetchUrls } from "../../utils/node-tls-client-session-handler";
import { fetchGsearch } from "../gsearch";
import {
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
  GSEARCH_PAGE_SIZE,
} from "../gsearch/constants";
import {
  FB_HEADERS,
  FACEBOOK_ERROR_MESSAGES,
  FACEBOOK_QUERY_LIMITS,
  FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT,
} from "./constants";
import {
  facebookAboutUrl,
  facebookMbasicPageUrl,
  facebookPageUrl,
  generateFacebookSearchQuery,
  isSparseFacebookLead,
  mapFacebookPageHtml,
  mergeFacebookLeads,
  uniquePageVanities,
} from "./compute";
import type { FACEBOOK_REQUEST, FACEBOOK_RESPONSE } from "./types";

function mapPageBody(text: string, url: string): FACEBOOK_RESPONSE {
  return mapFacebookPageHtml(text, url);
}

function resolveLimit(limit: number | undefined): number {
  return limit ?? FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT;
}

/** Vanities still missing a lead, or whose lead lacks any About contact/category signal. */
function sparseVanities(
  vanities: string[],
  byVanity: Map<string, FACEBOOK_RESPONSE>,
): string[] {
  return vanities.filter((v) => {
    const lead = byVanity.get(v.toLowerCase());
    return !lead || isSparseFacebookLead(lead);
  });
}

function leadMatchesVanity(
  lead: FACEBOOK_RESPONSE,
  vanity: string,
): boolean {
  const key = vanity.toLowerCase();
  const url = (lead.facebookUrl ?? "").toLowerCase();
  return (
    url.includes(`/${key}`) ||
    url.includes(`/${key}/`) ||
    lead.id?.toLowerCase() === key
  );
}

function mergeLeadIntoVanityMap(
  vanity: string,
  lead: FACEBOOK_RESPONSE,
  into: Map<string, FACEBOOK_RESPONSE>,
): void {
  const key = vanity.toLowerCase();
  const existing = into.get(key);
  into.set(key, existing ? mergeFacebookLeads(existing, lead) : lead);
}

function mergeLeadListIntoVanityMap(
  vanities: string[],
  leads: FACEBOOK_RESPONSE[],
  into: Map<string, FACEBOOK_RESPONSE>,
): void {
  const vanitySet = new Set(vanities.map((v) => v.toLowerCase()));

  for (const lead of leads) {
    const parsed =
      uniquePageVanities([lead.facebookUrl, lead.id])[0]?.toLowerCase() ??
      null;
    if (parsed && vanitySet.has(parsed)) {
      mergeLeadIntoVanityMap(parsed, lead, into);
      continue;
    }

    for (const v of vanities) {
      if (!leadMatchesVanity(lead, v)) continue;
      mergeLeadIntoVanityMap(v, lead, into);
      break;
    }
  }
}

/**
 * Enrich Page vanity names: try www `/about`, then home + mbasic when sparse,
 * then one more `/about` retry for intermittent thin shells.
 */
export async function fetchFromEntities(
  entities: string[] | (string | null)[],
  limit: number = FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT,
): Promise<FACEBOOK_RESPONSE[]> {
  if (!Array.isArray(entities)) {
    throw new Error(FACEBOOK_ERROR_MESSAGES.ENTITIES_NOT_ARRAY);
  }

  const vanities = uniquePageVanities(entities).slice(0, resolveLimit(limit));
  if (vanities.length === 0) {
    return [];
  }

  const byVanity = new Map<string, FACEBOOK_RESPONSE>();

  const primary = await fetchUrls<FACEBOOK_RESPONSE>({
    targets: vanities.map(facebookAboutUrl),
    headers: FB_HEADERS,
    mapper: (text, ctx) => mapPageBody(text, ctx.url),
  });
  mergeLeadListIntoVanityMap(vanities, primary, byVanity);

  const needFallback = sparseVanities(vanities, byVanity);

  if (needFallback.length > 0) {
    // mbasic first — it's a lightweight text-only shell, while the full www
    // page ships megabytes of inline state. Only escalate to www for
    // vanities still sparse after mbasic instead of always fetching both.
    const mbasicResults = await fetchUrls<FACEBOOK_RESPONSE>({
      targets: needFallback.map(facebookMbasicPageUrl),
      headers: FB_HEADERS,
      mapper: (text, ctx) => mapPageBody(text, ctx.url),
    });
    mergeLeadListIntoVanityMap(needFallback, mbasicResults, byVanity);

    const stillSparseAfterMbasic = sparseVanities(needFallback, byVanity);

    if (stillSparseAfterMbasic.length > 0) {
      const wwwResults = await fetchUrls<FACEBOOK_RESPONSE>({
        targets: stillSparseAfterMbasic.map(facebookPageUrl),
        headers: FB_HEADERS,
        mapper: (text, ctx) => mapPageBody(text, ctx.url),
      });
      mergeLeadListIntoVanityMap(stillSparseAfterMbasic, wwwResults, byVanity);
    }
  }

  // Soft-blocked /about responses are intermittent — one retry often recovers
  // website / email / phone field_type payloads.
  const needAboutRetry = sparseVanities(vanities, byVanity);

  if (needAboutRetry.length > 0) {
    const retryResults = await fetchUrls<FACEBOOK_RESPONSE>({
      targets: needAboutRetry.map(facebookAboutUrl),
      headers: FB_HEADERS,
      mapper: (text, ctx) => mapPageBody(text, ctx.url),
    });
    mergeLeadListIntoVanityMap(needAboutRetry, retryResults, byVanity);
  }

  const out: FACEBOOK_RESPONSE[] = [];
  for (const v of vanities) {
    const lead = byVanity.get(v.toLowerCase());
    if (!lead) continue;
    if (!lead.id) lead.id = v.toLowerCase();
    if (!lead.facebookUrl) lead.facebookUrl = facebookPageUrl(v);
    // Drop shells with no usable page identity
    if (!lead.name) continue;
    out.push(lead);
  }
  return out;
}

export async function fetchFromQuery(
  data: FACEBOOK_REQUEST,
): Promise<FACEBOOK_RESPONSE[]> {
  const { country, city, state } = data;
  const limit = resolveLimit(data.limit);

  const { searchQuery, words, chars } = generateFacebookSearchQuery(data);

  if (
    chars > GSEARCH_MAX_QUERY_CHARS ||
    words > FACEBOOK_QUERY_LIMITS.maxQueryWords
  ) {
    throw new Error(FACEBOOK_ERROR_MESSAGES.QUERY_TOO_LONG);
  }

  const pages = Math.min(
    Math.ceil(limit / GSEARCH_PAGE_SIZE),
    GSEARCH_MAX_PAGES,
  );

  console.log(`[facebook] Search query: ${searchQuery} (pages=${pages})`);

  const { results: searchResultsData, resolvedQuery } = await fetchGsearch({
    searchQuery,
    pages,
    country,
    region: city,
    state,
  });

  console.log(`[facebook] Resolved CSE query: ${resolvedQuery}`);

  if (!searchResultsData.length) {
    throw new Error(FACEBOOK_ERROR_MESSAGES.GSEARCH_EMPTY);
  }

  const vanities = uniquePageVanities(
    searchResultsData.map((row) => row.url ?? null),
  ).slice(0, limit);

  console.log(
    `[facebook] SERP rows=${searchResultsData.length} → unique page vanities=${vanities.length} (limit=${limit})`,
  );

  return await fetchFromEntities(vanities, limit);
}
