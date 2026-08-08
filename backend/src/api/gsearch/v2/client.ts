import { buildEvomiProxyUrl } from "../../../utils/fetch-session-common";
import { fetchGsearch } from "../client";
import { buildLocationQuery } from "../compute";
import {
  GSEARCH_DEFAULT_LANGUAGE,
  GSEARCH_DEFAULT_PAGES,
  GSEARCH_INTER_PAGE_GAP_MS,
} from "../constants";
import { gsearchProxiedPost, newGsearchSessionId, sleep } from "../http";
import type { GSEARCH_REQUEST } from "../types";
import {
  buildDocsExploreRequestBody,
  extractDocsExplorePayload,
  mapDocsExploreItems,
  parseDocsExploreJson,
} from "./compute";
import {
  GSEARCH_V2_BACKEND,
  GSEARCH_V2_DOCS_EXPLORE_URL,
  GSEARCH_V2_PAGE1_MAX_ATTEMPTS,
  GSEARCH_V2_PUBLIC_DOC_IDS,
} from "./constants";
import type {
  GSEARCH_V2_FETCH_RESPONSE,
  GSEARCH_V2_KNOWLEDGE_GRAPH,
  GSEARCH_V2_REQUEST_PARSED,
} from "./types";
import type { GSEARCH_RESULT } from "../types";

function pickDocId(offset: number): string {
  const ids = GSEARCH_V2_PUBLIC_DOC_IDS;
  return ids[((offset % ids.length) + ids.length) % ids.length]!;
}

function randomDocIdOffset(): number {
  return Math.floor(Math.random() * GSEARCH_V2_PUBLIC_DOC_IDS.length);
}

async function fetchDocsExplore(
  input: GSEARCH_V2_REQUEST_PARSED,
): Promise<GSEARCH_V2_FETCH_RESPONSE> {
  const {
    searchQuery,
    country,
    region,
    state,
    pages = GSEARCH_DEFAULT_PAGES,
    language = GSEARCH_DEFAULT_LANGUAGE,
  } = input;

  const resolvedQuery = buildLocationQuery(searchQuery, region, state);
  const hl = language;
  const acceptLanguage = `${hl},${hl}-${hl.toUpperCase()};q=0.7,en;q=0.3`;

  const results: GSEARCH_RESULT[] = [];
  let knowledgeGraph: GSEARCH_V2_KNOWLEDGE_GRAPH | null = null;
  let pagesFetched = 0;

  // Each attempt gets its own proxy session (fresh exit IP) and doc ID —
  // otherwise every single-page request (the default) would always land on
  // the same doc ID/IP pairing, concentrating load on one shared Google
  // resource instead of spreading it.
  async function attemptPage(
    page: number,
    docIdOffset: number,
  ): Promise<{ status: number; rawBody: string }> {
    const sessionId = newGsearchSessionId();
    const proxyUrl = buildEvomiProxyUrl({ sessionId, countryCode: country });
    if (!proxyUrl) {
      throw new Error("Evomi proxy is not configured");
    }
    const docId = pickDocId(docIdOffset + page - 1);
    const url = GSEARCH_V2_DOCS_EXPLORE_URL(docId);
    const body = buildDocsExploreRequestBody(resolvedQuery, page, hl, hl);
    const { status, body: rawBody } = await gsearchProxiedPost(url, {
      proxyUrl,
      body,
      contentType: "application/x-www-form-urlencoded",
      acceptLanguage,
    });
    return { status, rawBody };
  }

  let docIdOffset = randomDocIdOffset();

  for (let page = 1; page <= pages; page++) {
    if (page > 1) await sleep(GSEARCH_INTER_PAGE_GAP_MS);

    const firstPageFailed = page === 1;
    // Docs Explore returns intermittent 500s even on a healthy doc ID — retry
    // page 1 (with a fresh session + doc ID each time) since the request is
    // worthless without it; pages 2+ already degrade gracefully on failure.
    const maxAttempts = firstPageFailed ? GSEARCH_V2_PAGE1_MAX_ATTEMPTS : 1;

    let status = 0;
    let rawBody = "";
    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) docIdOffset = randomDocIdOffset();
      try {
        const res = await attemptPage(page, docIdOffset);
        status = res.status;
        rawBody = res.rawBody;
        if (status === 200 && rawBody.trim()) break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (status !== 200 || !rawBody.trim()) {
      if (firstPageFailed) {
        throw lastErr instanceof Error
          ? lastErr
          : new Error(`Docs Explore fetch failed: HTTP ${status}`);
      }
      break;
    }

    let parsed: unknown;
    try {
      parsed = parseDocsExploreJson(rawBody);
    } catch (err) {
      if (firstPageFailed) throw err;
      break;
    }

    const { items } = extractDocsExplorePayload(parsed);
    if (items.length === 0) break;

    const mapped = mapDocsExploreItems(items, results.length + 1);
    if (page === 1 && mapped.knowledgeGraph) {
      knowledgeGraph = mapped.knowledgeGraph;
    }
    if (mapped.results.length === 0) break;
    results.push(...mapped.results);
    pagesFetched++;
  }

  return {
    query: searchQuery,
    resolvedQuery,
    country,
    region: region ?? null,
    state: state ?? null,
    language: hl,
    backend: GSEARCH_V2_BACKEND.DOCS_EXPLORE,
    pagesFetched,
    knowledgeGraph,
    results,
  };
}

/**
 * G-Search v2:
 * - default → Docs Explore (KG + organic, browserless)
 * - `timeFilter` set → CSE fallback (Docs Explore has no date filters)
 */
export async function fetchGsearchV2(
  input: GSEARCH_V2_REQUEST_PARSED,
): Promise<GSEARCH_V2_FETCH_RESPONSE> {
  if (input.timeFilter) {
    const cse = await fetchGsearch(input as GSEARCH_REQUEST);
    return {
      query: cse.query,
      resolvedQuery: cse.resolvedQuery,
      country: cse.country,
      region: cse.region,
      state: cse.state,
      language: cse.language,
      backend: GSEARCH_V2_BACKEND.CSE,
      pagesFetched: cse.pagesFetched,
      knowledgeGraph: null,
      results: cse.results,
    };
  }

  return fetchDocsExplore(input);
}
