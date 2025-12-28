import puppeteer, { Browser, Page } from "puppeteer";
import { getBrowserOptions } from "../../utils/browser.js";
import { config } from "dotenv";
import { Response } from "express";

config();

// Configuration constants
const MAX_BROWSER_SESSIONS = Number(process.env.MAX_BROWSER_SESSIONS) || 10;
const MAX_PAGES_PER_BROWSER = Number(process.env.MAX_PAGES_PER_BROWSER) || 5;
const TOTAL_CONCURRENT_URLS = MAX_BROWSER_SESSIONS * MAX_PAGES_PER_BROWSER;

type EachPageResult<T> = {
  success: boolean;
  url: string;
  data?: T;
  error?: string;
};

type SingleBrowserResult<T> = {
  results: EachPageResult<T>[];
  error?: string;
  browserIndex: number;
};

const processSingleBrowser = async <T>(
  urlItems: string[],
  browserIndex: number,
  batchNumber: number,
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<SingleBrowserResult<T>> => {
  let browser: Browser | null = null;
  const pages: Page[] = [];

  try {

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);

    if (!browser) {
      return {
        results: [],
        error: `Browser launch failed for browser ${browserIndex}`,
        browserIndex,
      };
    }

    // Process each URL with its own page
    const pagePromises = urlItems.map(
      async (url, pageIndex): Promise<EachPageResult<T>> => {
        let page: Page | null = null;

        try {

          page = await browser!.newPage();
          pages.push(page);

          page.setDefaultTimeout(30000);
          page.setDefaultNavigationTimeout(30000);

          const scrapeData = await scrapingFunction(url, page);

          return { success: true, data: scrapeData, url };
        } catch (pageScrapeError) {
          const errorMessage =
            pageScrapeError instanceof Error
              ? pageScrapeError.message
              : String(pageScrapeError);

          return {
            success: false,
            url,
            error: `Page had error for this url ${url} at Browser ${browserIndex} for page ${
              pageIndex + 1
            } : ${errorMessage}`,
          };
        }
      }
    );

    const results = await Promise.all(pagePromises);

    return {
      results,
      browserIndex,
    };
  } catch (browserScrapeError) {
    const errorMessage =
      browserScrapeError instanceof Error
        ? browserScrapeError.message
        : String(browserScrapeError);

    return {
      results: urlItems.map((u) => ({
        success: false,
        url: u,
        error: `Browser ${browserIndex} failed before processing url ${u}: ${errorMessage}`,
      })),
      error: errorMessage,
      browserIndex,
    };
  } finally {

    for (let i = 0; i < pages.length; i++) {
      try {
        const page = pages[i];
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (pageCloseError) {
        console.error(
          `⚠️ Browser ${browserIndex}-Page ${i + 1}: Error closing page:`,
          pageCloseError
        );
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (browserCloseError) {
        console.error(
          `⚠️ Browser ${browserIndex}: Error closing browser:`,
          browserCloseError
        );
      }
    }
  }
};

const processBatchOfBrowsers = async <T>(
  urlItems: string[],
  batchNumber: number,
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<SingleBrowserResult<T>[]> => {

  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  const browserPromises = browserPagesBatches.map((batchUrls, index) =>
    processSingleBrowser(
      batchUrls,
      index + 1,
      batchNumber,
      scrapingFunction,
      res
    )
  );

  const browserResults = await Promise.all(browserPromises);
  const flattenedBrowserResults = browserResults.flat();

  await new Promise((resolve) => setTimeout(resolve, 10000));

  return flattenedBrowserResults;
};

type TBrowserBatchHandlerReturn<T> = {
  success: boolean;
  results: T[];
  errors: string[];
  successCount: number;
  errorCount: number;
  totalUrls: number;
  batches: number;
  duration: number;
};

export const BrowserBatchHandler = async <T>(
  urlItems: string[],
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<TBrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();

  try {
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      batches.push(urlItems.slice(i, i + TOTAL_CONCURRENT_URLS));
    }

    const aggregatedResults: T[] = [];
    const aggregatedErrors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      try {
        const currentBatchResults = await processBatchOfBrowsers(
          batches[batchIndex],
          batchIndex + 1,
          scrapingFunction,
          res
        );

        currentBatchResults.forEach((browserResult) => {
          if (browserResult.error) {
            aggregatedErrors.push(browserResult.error);
          }

          browserResult.results.forEach((pageResult) => {
            if (pageResult.success && pageResult.data) {
              aggregatedResults.push(pageResult.data);
              successCount++;
            } else if (pageResult.error) {
              aggregatedErrors.push(pageResult.error);
              errorCount++;
            }
          });
        });
      } catch (batchError) {
        const batchErrorMessage = `Batch ${batchIndex + 1} processing failed: ${
          batchError instanceof Error ? batchError.message : String(batchError)
        }`;

        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    return {
      success: errorCount < urlItems.length,
      results: aggregatedResults,
      errors: aggregatedErrors,
      duration,
      errorCount,
      successCount,
      batches: batches.length,
      totalUrls: urlItems.length,
    };
  } catch (error) {
    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    return {
      duration,
      success: false,
      results: [],
      errors: [error instanceof Error ? error.message : String(error)],
      batches: 0,
      successCount: 0,
      errorCount: urlItems.length,
      totalUrls: urlItems.length,
    };
  }
};

export const browserDebugger = async (seconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};
