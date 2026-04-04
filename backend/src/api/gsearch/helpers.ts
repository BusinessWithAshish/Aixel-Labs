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
  DEFAULT_GSEARCH_LANGUAGE,
  defaultGsearchQueryParams,
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
 * Build the Google SERP URL like `scraper/api/google_search/helpers.normalize_google_search_target`:
 * optional ` in {near}` on `q`, `gl` / `hl`, `filter=0`, `nfpr=1`, `pws=0`, `udm=14`, optional `near` & `tbs`.
 */
export function buildGSearchUrl(props: GSEARCH_REQUEST) {
  const { searchQuery, country, city, timeFilter } = props;

  const finalQuery = `${searchQuery} in ${city}`;
  const params = new URLSearchParams(defaultGsearchQueryParams);
  params.set(GOOGLE_SEARCH_QUERY_PARAMS.q, finalQuery);
  params.set(GOOGLE_SEARCH_QUERY_PARAMS.gl, country.toLowerCase());
  if (timeFilter) params.set(GOOGLE_SEARCH_QUERY_PARAMS.tbs, timeFilter);
  return `${GOOGLE_BASE_URL}/search?${params.toString()}`;
}

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
      const sessionId =
        (crypto as any).randomUUID?.() ??
        crypto.randomBytes(12).toString("hex");
      const proxyPassword = `${PROXY_CONFIG.PASSWORD}${proxyDelimiter}country-${country}${proxyDelimiter}session-${sessionId}`;

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
        searchQuery,
        totalPages,
        language,
        tbs: timeFilter ?? null,
        gl: country.toLowerCase(),
        near: city,
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


// export async function fetchGSearchScraper(
//   props: GSEARCH_REQUEST,
// ): Promise<GSEARCH_RESPONSE[]> {
//   const { searchQuery, country, city, language = DEFAULT_GSEARCH_LANGUAGE, timeFilter } = props;



// }
