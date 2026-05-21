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
  DEFAULT_GSEARCH_MAX_PAGES,
  GOOGLE_BASE_URL,
  GOOGLE_SEARCH_URL,
  GOOGLE_SEARCH_QUERY_PARAMS,
  defaultGsearchQueryParams,
  GOOGLE_SEARCH_PATH,
} from "./constants";
import { applyGoogleSearchStealth } from "../../utils/stealth-handlers";
import type { Page } from "puppeteer-core";

// ── Load the inspector script once at module level (not on every request) ──
const INSPECTOR_SCRIPT = readFileSync(
  join(__dirname, "gsearch-injector.js"),
  "utf-8",
);

/** One stealth apply per Puppeteer page (retries reuse the same page). */
const gsearchStealthedPages = new WeakSet<Page>();

/**
 * Canonical Google SERP query string (no `start` / `num`). Single source for `page.goto` and injector fetches.
 * Matches previous behavior: `q` = `{searchQuery} in {city}`, `filter`/`nfpr`/`pws`/`udm`/`hl`, `gl`, optional `tbs`.
 */
export function buildGSearchUrl(props: GSEARCH_REQUEST): string {
  const baseUrl = new URL(GOOGLE_BASE_URL);
  baseUrl.pathname = GOOGLE_SEARCH_PATH;

  const { searchQuery, country, city, timeFilter } = props;

  // DEFAULT PARAMS
  const params = new URLSearchParams(defaultGsearchQueryParams);

  // DYNAMIC PARAMS
  const finalQuery = `${searchQuery} in ${city}`;
  params.set(GOOGLE_SEARCH_QUERY_PARAMS.q, finalQuery);
  params.set(GOOGLE_SEARCH_QUERY_PARAMS.gl, country.toLowerCase());

  // OPTIONAL PARAMS
  if (city) params.set(GOOGLE_SEARCH_QUERY_PARAMS.near, city);
  if (timeFilter) params.set(GOOGLE_SEARCH_QUERY_PARAMS.tbs, timeFilter);

  return `${baseUrl.toString()}?${params.toString()}`;
}

export async function fetchGSearch(
  props: GSEARCH_REQUEST,
): Promise<GSEARCH_RESPONSE[]> {
  const { pages, country } = props;

  const finalUrl = buildGSearchUrl(props);

  const totalPages = Math.min(pages, DEFAULT_GSEARCH_MAX_PAGES);

  console.log(`[GScraper] Search URL: ${finalUrl}`);

  const finalResults = await BrowserBatchHandler({
    urlItems: [GOOGLE_SEARCH_URL],
    scrapingFunction: async (url, page) => {
      if (!PROXY_CONFIG.USERNAME || !PROXY_CONFIG.PASSWORD) {
        throw new Error("[GSearch] Proxy credentials are not set");
      }

      const proxyDelimiter = "_";
      // EVOMI session rotation: new session id => new exit IP (most pools)
      const proxyPassword = `${PROXY_CONFIG.PASSWORD}${proxyDelimiter}country-${country}`;

      await page.authenticate({
        username: PROXY_CONFIG.USERNAME,
        password: proxyPassword,
      });

      // Not full pageStealther: extra headers + request interception break Google
      // reCAPTCHA / gstatic (CORS + aborted scripts). See applyGoogleSearchStealth.
      if (!gsearchStealthedPages.has(page)) {
        await applyGoogleSearchStealth(page as Page);
        gsearchStealthedPages.add(page);
      }

      if (page.listenerCount("console") === 0) {
        page.on("console", (msg) =>
          console.log(`[Browser:${msg.type()}] ${msg.text()}`),
        );
      }
      if (page.listenerCount("pageerror") === 0) {
        page.on("pageerror", (err) =>
          console.error(
            `[Browser:pageerror] ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      }

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

      // ── Step 2: Navigate to search (same params as Python gsearch) ──
      console.log(`[GScraper] Navigating to ${finalUrl}`);
      const searchNavigation = await page.goto(finalUrl, {
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
        initialUrl: finalUrl,
        totalPages,
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
