import { randomUUID } from "crypto";
import { Impit } from "impit";

import { buildEvomiProxyUrl } from "../../utils/fetch-session-common";
import {
  GSEARCH_CSE_ELEMENT_URL,
  GSEARCH_CSE_JS_URL,
  GSEARCH_DEFAULT_CX,
  GSEARCH_INTER_PAGE_GAP_MS,
  GSEARCH_MAX_START,
  GSEARCH_PAGE_SIZE,
  GSEARCH_REFERER,
  GSEARCH_REQUEST_TIMEOUT_MS,
  GSEARCH_TOKEN_TTL_MS,
  GSEARCH_USER_AGENT,
} from "./constants";
import {
  buildLocationQuery,
  buildTimeSort,
  mapCseResult,
  parseCseJsToken,
  parseJsonp,
} from "./helpers";
import type { GsearchRequest } from "./schemas";
import type { GsearchResponse, GsearchResult, GsearchToken } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Generate a ≤12-char sticky Evomi session id (proxy requirement). */
function newSessionId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 12);
}

async function proxiedGet(
  url: string,
  opts: { proxyUrl: string; referer?: string },
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {
    "user-agent": GSEARCH_USER_AGENT,
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    ...(opts.referer ? { referer: opts.referer } : {}),
  };

  const impit = new Impit({
    browser: "chrome131",
    followRedirects: true,
    timeout: GSEARCH_REQUEST_TIMEOUT_MS,
    headers,
    proxyUrl: opts.proxyUrl,
  });

  const res = await impit.fetch(url, { headers });
  const body = await res.text();
  return { status: res.status, body };
}

// Token is tied to `cx` (not IP-bound) and valid ~1h — cache per cx.
const tokenCache = new Map<string, GsearchToken>();

async function fetchToken(cx: string, proxyUrl: string): Promise<GsearchToken> {
  const cached = tokenCache.get(cx);
  if (cached && Date.now() - cached.fetchedAt < GSEARCH_TOKEN_TTL_MS) {
    return cached;
  }

  const { status, body } = await proxiedGet(GSEARCH_CSE_JS_URL(cx), { proxyUrl });
  if (status !== 200) throw new Error(`cse.js fetch failed: HTTP ${status}`);

  const opts = parseCseJsToken(body);
  if (!opts.cse_token) throw new Error("cse.js: cse_token missing");

  const token: GsearchToken = {
    cseToken: opts.cse_token,
    cselibVersion: opts.cselibVersion ?? "",
    exp: Array.isArray(opts.exp) ? opts.exp : [],
    fetchedAt: Date.now(),
  };
  tokenCache.set(cx, token);
  return token;
}

function buildSearchUrl(params: {
  cx: string;
  token: GsearchToken;
  query: string;
  language: string;
  country: string;
  safe: string;
  start: number;
  sort: string | null;
}): string {
  const sp = new URLSearchParams({
    rsz: "filtered_cse",
    num: String(GSEARCH_PAGE_SIZE),
    hl: params.language,
    cselibv: params.token.cselibVersion,
    cx: params.cx,
    q: params.query,
    safe: params.safe,
    cse_tok: params.token.cseToken,
    callback: "_",
    rurl: "",
    searchtype: "",
    gl: params.country,
  });
  if (params.token.exp.length) sp.set("exp", params.token.exp.join(","));
  if (params.sort) sp.set("sort", params.sort);
  if (params.start > 0) sp.set("start", String(params.start));
  return `${GSEARCH_CSE_ELEMENT_URL}?${sp.toString()}`;
}

/**
 * Browserless google.com web search via the CSE element endpoint. Always routed
 * through the Evomi proxy (country-targeted, best-effort region). Fetches and
 * caches a token, then pages through results.
 */
export async function fetchGsearch(input: GsearchRequest): Promise<GsearchResponse> {
  const {
    searchQuery,
    country,
    region,
    pages = 1,
    language = "en",
    safe = "off",
    timeFilter,
  } = input;

  const cx = GSEARCH_DEFAULT_CX;
  const sessionId = newSessionId();
  // Proxy is routed by COUNTRY only. Evomi has limited per-city region coverage,
  // and an unsupported `_region-*` value fails the tunnel — so city/region
  // precision comes from the query text (`buildLocationQuery`), matching the
  // browser-worker's `${query} in ${city}` + `_country-XX` pattern.
  const proxyUrl = buildEvomiProxyUrl({
    sessionId,
    countryCode: country,
  });
  if (!proxyUrl) {
    throw new Error("Evomi proxy is not configured");
  }

  const resolvedQuery = buildLocationQuery(searchQuery, region);
  const sort = buildTimeSort(timeFilter);
  const token = await fetchToken(cx, proxyUrl);

  const results: GsearchResult[] = [];
  let estimatedResultCount: string | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < pages; page++) {
    const start = page * GSEARCH_PAGE_SIZE;
    // Google refuses start > 100 (hard CSE ceiling) — stop before wasting a call.
    if (start > GSEARCH_MAX_START) break;
    if (page > 0) await sleep(GSEARCH_INTER_PAGE_GAP_MS);

    const url = buildSearchUrl({
      cx,
      token,
      query: resolvedQuery,
      language,
      country: country.toLowerCase(),
      safe,
      start,
      sort,
    });

    const { status, body } = await proxiedGet(url, { proxyUrl, referer: GSEARCH_REFERER });

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
    if (rows.length === 0) break; // no more pages

    for (const row of rows) {
      results.push(mapCseResult(row, results.length + 1));
    }
    pagesFetched++;
  }

  return {
    query: searchQuery,
    resolvedQuery,
    country,
    region: region ?? null,
    language,
    estimatedResultCount,
    pagesFetched,
    results,
  };
}
