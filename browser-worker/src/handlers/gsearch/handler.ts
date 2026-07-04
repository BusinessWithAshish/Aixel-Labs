import { Request, Response } from "express";
import { readFileSync } from "fs";
import { join } from "path";
import type { Page } from "puppeteer-core";

import { BrowserBatchHandler } from "../../browser/browser-batch-handler";
import { PROXY_CONFIG } from "../../browser/constants";
import { pageStealther } from "../../browser/stealth-handlers";
import { toAlpha2CountryCode } from "../../utils/country";

import {
  DEFAULT_GSEARCH_MAX_PAGES,
  GOOGLE_BASE_URL,
  GOOGLE_SEARCH_PATH,
  GOOGLE_SEARCH_QUERY_PARAMS,
  GSEARCH_NAVIGATION_TIMEOUT_MS,
  defaultGsearchQueryParams,
} from "./constants";
import { GSEARCH_REQUEST_SCHEMA } from "./schemas";
import {
  GSEARCH_INJECTOR_PROPS,
  GSEARCH_REQUEST,
  GSEARCH_RESPONSE,
} from "./types";

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

  const params = new URLSearchParams(defaultGsearchQueryParams);

  const finalQuery = city ? `${searchQuery} in ${city}` : searchQuery;
  params.set(GOOGLE_SEARCH_QUERY_PARAMS.q, finalQuery);

  const countryCode = toAlpha2CountryCode(country);
  if (countryCode) {
    params.set(GOOGLE_SEARCH_QUERY_PARAMS.gl, countryCode.toLowerCase());
  }

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
    // Warm up on the homepage (cookies + proxy session), not bare /search — matches Python scraper.
    urlItems: [GOOGLE_BASE_URL],
    scrapingFunction: async (url, page) => {
      if (!PROXY_CONFIG.USERNAME || !PROXY_CONFIG.PASSWORD) {
        throw new Error("[GSearch] Proxy credentials are not set");
      }

      const countryCode = toAlpha2CountryCode(country);
      if (!countryCode) {
        throw new Error(`[GSearch] Unrecognized country: "${country}"`);
      }

      // Evomi expects an ISO alpha-2 code (e.g. "_country-IN"); a full name
      // like "_country-india" makes the proxy return an empty response.
      const proxyPassword = `${PROXY_CONFIG.PASSWORD}_country-${countryCode}`;

      await page.authenticate({
        username: PROXY_CONFIG.USERNAME,
        password: proxyPassword,
      });

      // Unified stealth pipeline (Search + Maps). See stealth-handlers.ts.
      if (!gsearchStealthedPages.has(page)) {
        await pageStealther(page as Page);
        gsearchStealthedPages.add(page);
      }

      page.setDefaultTimeout(GSEARCH_NAVIGATION_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(GSEARCH_NAVIGATION_TIMEOUT_MS);

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

      // ── Step 1: Proxy auth + Google homepage (session warmup) ──
      console.log(`[GScraper] Base navigation to ${url}`);
      const baseNavigation = await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: GSEARCH_NAVIGATION_TIMEOUT_MS,
      });
      const baseStatusCode = baseNavigation?.status();
      if (baseStatusCode && baseStatusCode >= 400) {
        throw new Error(
          `[GSearch] Base navigation failed with status ${baseStatusCode}`,
        );
      }

      // ── Step 2: Navigate to SERP (referer mimics clicking from homepage) ──
      console.log(`[GScraper] Navigating to ${finalUrl}`);
      const searchNavigation = await page.goto(finalUrl, {
        waitUntil: "domcontentloaded",
        timeout: GSEARCH_NAVIGATION_TIMEOUT_MS,
        referer: `${GOOGLE_BASE_URL}/`,
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

      await page
        .waitForSelector("#rso, #search, form[action='/search']", {
          timeout: GSEARCH_NAVIGATION_TIMEOUT_MS,
        })
        .catch(() => {
          const currentUrl = page.url();
          if (
            currentUrl.includes("/sorry/") ||
            currentUrl.includes("consent.")
          ) {
            throw new Error(
              `[GSearch] Google blocked or consent interstitial at ${currentUrl}`,
            );
          }
        });

      // ── Step 3: Inject dynamic vars then run inspector script ──
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

// ─── Handler: POST /gsearch ───────────────────────────
export async function gsearchHandler(req: Request, res: Response) {
  const requestBody = GSEARCH_REQUEST_SCHEMA.safeParse(req.body);

  if (!process.env.EVOMI_PROXY_USERNAME || !process.env.EVOMI_PROXY_PASSWORD) {
    res.status(403).json({
      success: false,
      error: "[GSEARCH] : Missing proxy credentials",
    });
    return;
  }

  if (!requestBody.success) {
    res.status(400).json({
      success: false,
      error: "[GSEARCH] : Invalid request parameters",
    });
    return;
  }

  try {
    const finalResults = await fetchGSearch(requestBody.data);

    res.status(200).json({
      success: true,
      data: finalResults,
    });
    return;
  } catch (error) {
    console.error("[GSEARCH] : Error fetching results", error);
    res.status(500).json({
      success: false,
      error: "[GSEARCH] : Internal server error",
    });
    return;
  }
}
