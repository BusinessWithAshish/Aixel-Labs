import {
  GSEARCH_INJECTOR_PROPS,
  GSEARCH_REQUEST,
  GSEARCH_RESPONSE,
} from "./types";
import { BrowserBatchHandler } from "../../utils/browser-batch-handler";
import { DEFAULT_PAGE_LOAD_TIMEOUT, PROXY_CONFIG } from "../../utils/constants";
import { readFileSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import {
  HEADERS,
  DEFAULT_GSEARCH_MAX_PAGES,
  GOOGLE_SEARCH_URL,
  GOOGLE_SEARCH_QUERY_PARAMS,
  DEFAULT_GSEARCH_LANGUAGE,
} from "./constants";

// ── Load the inspector script once at module level (not on every request) ──
const INSPECTOR_SCRIPT = readFileSync(
  join(__dirname, "gsearch-injector.js"),
  "utf-8",
);

export async function fetchGSearch(
  props: GSEARCH_REQUEST,
): Promise<GSEARCH_RESPONSE[]> {
  const {
    searchQuery,
    pages,
    country,
    city,
    timeFilter,
    language = DEFAULT_GSEARCH_LANGUAGE,
  } = props;

  const totalPages = Math.min(pages, DEFAULT_GSEARCH_MAX_PAGES);

  console.log(`[GScraper] Query: "${searchQuery}" | Pages: ${totalPages}`);

  const finalResults = await BrowserBatchHandler({
    urlItems: [GOOGLE_SEARCH_URL],
    scrapingFunction: async (url, page) => {
      if (!PROXY_CONFIG.USERNAME || !PROXY_CONFIG.PASSWORD) {
        throw new Error("[GSearch] Proxy credentials are not set");
      }

      const proxyDelimiter = "_";
      // EVOMI session rotation: new session id => new exit IP (most pools)
      const sessionId =
        (crypto as any).randomUUID?.() ??
        crypto.randomBytes(12).toString("hex");
      const proxyPassword = `${PROXY_CONFIG.PASSWORD}${proxyDelimiter}country-${country}${proxyDelimiter}city-${city}${proxyDelimiter}session-${sessionId}`;

      await page.authenticate({
        username: PROXY_CONFIG.USERNAME,
        password: proxyPassword,
      });

      page.on("console", (msg) =>
        console.log(`[Browser:${msg.type()}] ${msg.text()}`),
      );
      page.on("pageerror", (err: any) =>
        console.error(`[Browser:pageerror] ${err?.message}`),
      );

      // ── Step 1: Proxy auth + homepage ──
      console.log(`[GScraper] Base navigation to ${url}`);
      const baseNavigation = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
      });
      const baseStatusCode = baseNavigation?.status();
      if (baseStatusCode && baseStatusCode >= 400) {
        throw new Error(
          `[GSearch] Base navigation failed with status ${baseStatusCode}`,
        );
      }

      // ── Step 2: Navigate to search — minimal params ──
      const finalSearchUrl = new URL(GOOGLE_SEARCH_URL);

      // APPLY SEARCH QUERY
      finalSearchUrl.searchParams.set(
        GOOGLE_SEARCH_QUERY_PARAMS.q,
        searchQuery,
      );

      // APPLY LANGUAGE
      finalSearchUrl.searchParams.set(GOOGLE_SEARCH_QUERY_PARAMS.hl, language);

      // APPLY COUNTRY
      finalSearchUrl.searchParams.set(GOOGLE_SEARCH_QUERY_PARAMS.gl, country);

      // CONDITIONAL FILTERS
      // APPLY TIME FILTER
      if (timeFilter) {
        finalSearchUrl.searchParams.set(
          GOOGLE_SEARCH_QUERY_PARAMS.tbs,
          timeFilter,
        );
      }

      console.log(`[GScraper] Navigating to ${finalSearchUrl.toString()}`);
      const searchNavigation = await page.goto(finalSearchUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
      });
      const searchStatusCode = searchNavigation?.status();
      if (searchStatusCode === 429) {
        throw new Error(
          "[GSearch] Google returned HTTP 429 (rate limited). Rotate proxy/session and retry later.",
        );
      }
      if (searchStatusCode && searchStatusCode >= 400) {
        throw new Error(
          `[GSearch] Search navigation failed with status ${searchStatusCode}`,
        );
      }

      // ── Step 3: Inject dynamic vars then run inspector script ──
      // Variables are injected as a global before the script runs — clean and type-safe
      const gsearchInjectorProps: GSEARCH_INJECTOR_PROPS = {
        searchQuery: searchQuery,
        totalPages: totalPages,
        language: language,
        tbs: timeFilter ?? null, // ← pass null not undefined so JSON.stringify omits cleanly
      };

      await page.evaluate(
        `window.__GSCRAPER__ = ${JSON.stringify(gsearchInjectorProps)};`,
      );

      console.log(`[GScraper] Running inspector for ${totalPages} page(s)...`);
      const results = (await page.evaluate(
        INSPECTOR_SCRIPT,
      )) as GSEARCH_RESPONSE[];

      console.log(`[GScraper] ✅ Done. Total: ${results.length} results`);
      return results;
    },
    res: null,
    allowBatchWaiting: false,
  });

  if (!finalResults.results.length && finalResults.errors.length) {
    throw new Error(finalResults.errors[0]);
  }

  return finalResults.results.flat();
}
