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
  preferRicherLead,
  uniquePageVanities,
} from "./compute";
import type { FACEBOOK_REQUEST, FACEBOOK_RESPONSE } from "./types";

function mapPageBody(text: string, url: string): FACEBOOK_RESPONSE {
  return mapFacebookPageHtml(text, url);
}

function resolveLimit(limit: number | undefined): number {
  return limit ?? FACEBOOK_REQUEST_RESULT_LIMIT_DEFAULT;
}

/**
 * Enrich Page vanity names: try www `/about`, then mbasic fallback when sparse.
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

  const aboutUrls = vanities.map(facebookAboutUrl);
  const primary = await fetchUrls<FACEBOOK_RESPONSE>({
    targets: aboutUrls,
    headers: FB_HEADERS,
    mapper: (text, ctx) => mapPageBody(text, ctx.url),
  });

  // Index primary by vanity order (fetchUrls preserves successful order; align by vanity)
  const byVanity = new Map<string, FACEBOOK_RESPONSE>();
  for (let i = 0; i < vanities.length; i++) {
    const vanity = vanities[i];
    const lead =
      primary.find(
        (p) =>
          p.facebookUrl?.toLowerCase().includes(`/${vanity.toLowerCase()}`) ||
          p.id?.toLowerCase() === vanity.toLowerCase(),
      ) ?? primary[i];
    if (lead) byVanity.set(vanity.toLowerCase(), lead);
  }

  const needFallback = vanities.filter((v) => {
    const lead = byVanity.get(v.toLowerCase());
    return !lead || isSparseFacebookLead(lead);
  });

  if (needFallback.length > 0) {
    // Also try desktop page home + mbasic
    const fallbackTargets = needFallback.flatMap((v) => [
      facebookPageUrl(v),
      facebookMbasicPageUrl(v),
    ]);
    const fallbackResults = await fetchUrls<FACEBOOK_RESPONSE>({
      targets: fallbackTargets,
      headers: FB_HEADERS,
      mapper: (text, ctx) => mapPageBody(text, ctx.url),
    });

    for (const lead of fallbackResults) {
      const vanity =
        uniquePageVanities([lead.facebookUrl, lead.id])[0] ?? null;
      if (!vanity) continue;
      const key = vanity.toLowerCase();
      const existing = byVanity.get(key);
      byVanity.set(
        key,
        existing ? preferRicherLead(existing, lead) : lead,
      );
    }

    // Map remaining sparse by positional pairing when vanity missing on parse
    for (const v of needFallback) {
      const key = v.toLowerCase();
      if (byVanity.has(key) && !isSparseFacebookLead(byVanity.get(key)!)) {
        continue;
      }
      const guessed = fallbackResults.find((r) =>
        (r.facebookUrl ?? "").toLowerCase().includes(`/${key}`),
      );
      if (guessed) {
        const existing = byVanity.get(key);
        byVanity.set(
          key,
          existing ? preferRicherLead(existing, guessed) : guessed,
        );
      } else if (!byVanity.has(key)) {
        // Ensure we still emit a stub with id = vanity for dedupe
        byVanity.set(key, {
          id: key,
          name: null,
          facebookUrl: facebookPageUrl(v),
          category: null,
          website: null,
          phone: null,
          emails: null,
          address: null,
          followers: null,
          likes: null,
          verified: null,
          profileImageUrl: null,
          bio: null,
        });
      }
    }
  }

  const out: FACEBOOK_RESPONSE[] = [];
  for (const v of vanities) {
    const lead = byVanity.get(v.toLowerCase());
    if (!lead) continue;
    // Ensure stable id + url
    if (!lead.id) lead.id = v.toLowerCase();
    if (!lead.facebookUrl) lead.facebookUrl = facebookPageUrl(v);
    if (isSparseFacebookLead(lead) && !lead.name) {
      // Drop completely empty parses (no name) — not useful as leads
      continue;
    }
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
