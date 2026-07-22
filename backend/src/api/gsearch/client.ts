import { buildEvomiProxyUrl } from "../../utils/fetch-session-common";
import {
  buildLocationQuery,
  buildTimeSort,
  mapCseResult,
  parseJsonp,
} from "./compute";
import {
  GSEARCH_DEFAULT_CX,
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_INTER_PAGE_GAP_MS,
  GSEARCH_MAX_START,
  GSEARCH_PAGE_SIZE,
  GSEARCH_REFERER,
  GSEARCH_SAFE,
} from "./constants";
import { gsearchProxiedGet, newGsearchSessionId, sleep } from "./http";
import { buildGsearchSearchUrl, fetchGsearchToken } from "./token";
import type {
  GSEARCH_RAW_CSE_RESULT,
  GSEARCH_REQUEST,
  GSEARCH_FETCH_RESPONSE,
  GSEARCH_RESULT,
} from "./types";

/**
 * Browserless google.com web search via the CSE element endpoint. Always routed
 * through the Evomi proxy (country-targeted, best-effort region). Fetches and
 * caches a token, then pages through results.
 */
export async function fetchGsearch(
  input: GSEARCH_REQUEST,
): Promise<GSEARCH_FETCH_RESPONSE> {
  const {
    searchQuery,
    country,
    region,
    state,
    pages = GSEARCH_DEFAULT_PAGES,
    language = GSEARCH_DEFAULT_LANGUAGE,
    safe = GSEARCH_SAFE.OFF,
    timeFilter,
  } = input;

  const cx = GSEARCH_DEFAULT_CX;
  const sessionId = newGsearchSessionId();
  // Proxy is routed by COUNTRY only. Evomi has limited per-city region coverage,
  // and an unsupported `_region-*` value fails the tunnel — so city/state
  // precision comes from the query text (`buildLocationQuery`), matching the
  // browser-worker's `${query} in ${city}` + `_country-XX` pattern.
  const proxyUrl = buildEvomiProxyUrl({
    sessionId,
    countryCode: country,
  });
  if (!proxyUrl) {
    throw new Error("Evomi proxy is not configured");
  }

  const resolvedQuery = buildLocationQuery(searchQuery, region, state);
  const sort = buildTimeSort(timeFilter);
  const token = await fetchGsearchToken(cx, proxyUrl);

  const results: GSEARCH_RESULT[] = [];
  let estimatedResultCount: string | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < pages; page++) {
    const start = page * GSEARCH_PAGE_SIZE;
    // Google refuses start > 100 (hard CSE ceiling) — stop before wasting a call.
    if (start > GSEARCH_MAX_START) break;
    if (page > 0) await sleep(GSEARCH_INTER_PAGE_GAP_MS);

    const url = buildGsearchSearchUrl({
      cx,
      token,
      query: resolvedQuery,
      language,
      country: country.toLowerCase(),
      safe,
      start,
      sort,
    });

    const { status, body } = await gsearchProxiedGet(url, {
      proxyUrl,
      referer: GSEARCH_REFERER,
    });

    // After page 1, tolerate transient failures / "Sorry" pages by returning
    // what we have. Only fail hard if the very first page fails.
    const firstPageFailed = page === 0;

    if (status !== 200 || !body.includes("{")) {
      if (firstPageFailed) {
        throw new Error(`CSE element fetch failed: HTTP ${status}`);
      }
      break;
    }

    let raw: Record<string, unknown>;
    try {
      raw = parseJsonp(body);
    } catch (err) {
      if (firstPageFailed) throw err;
      break;
    }

    const error = raw.error as { message?: string; code?: number } | undefined;
    if (error) {
      if (firstPageFailed) {
        throw new Error(
          `CSE element error${error.code ? ` (${error.code})` : ""}: ${error.message ?? "unknown"}`,
        );
      }
      break;
    }

    const cursor = raw.cursor as { estimatedResultCount?: string } | undefined;
    if (estimatedResultCount === null) {
      estimatedResultCount = cursor?.estimatedResultCount ?? null;
    }

    const rows = Array.isArray(raw.results)
      ? (raw.results as Record<string, unknown>[])
      : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const mapped = mapCseResult(
        row as GSEARCH_RAW_CSE_RESULT,
        results.length + 1,
      );
      if (mapped) results.push(mapped);
    }
    pagesFetched++;
  }

  return {
    query: searchQuery,
    resolvedQuery,
    country,
    region: region ?? null,
    state: state ?? null,
    language,
    estimatedResultCount,
    pagesFetched,
    results,
  };
}
