import {
  GSEARCH_INJECTOR_PROPS,
  GSEARCH_REQUEST,
  GSEARCH_RESPONSE,
} from "./types";
import { BrowserBatchHandler } from "../../utils/browser-batch-handler";
import { DEFAULT_PAGE_LOAD_TIMEOUT } from "../../utils/constants";
import { readFileSync } from "fs";
import { join } from "path";
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
      page.on("console", (msg) =>
        console.log(`[Browser:${msg.type()}] ${msg.text()}`),
      );
      page.on("pageerror", (err: any) =>
        console.error(`[Browser:pageerror] ${err?.message}`),
      );

      // ── Step 1: Proxy auth + homepage ──

      const proxyDelimiter = "_";
      const buildPRoxyPassword = `${process.env.EVOMI_PROXY_PASSWORD!}${proxyDelimiter}country-${country}${proxyDelimiter}city-${city}`;

      await page.authenticate({
        username: process.env.EVOMI_PROXY_USERNAME!,
        password: buildPRoxyPassword,
      });

      console.log(`[GScraper] Base navigation to ${url}`);
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
      });

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
      await page.goto(finalSearchUrl.toString(), {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
      });

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

  return finalResults.results.flat();
}
