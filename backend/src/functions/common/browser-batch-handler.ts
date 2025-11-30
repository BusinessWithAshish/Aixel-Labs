import puppeteer, { Browser, Page } from "puppeteer";
import { getBrowserOptions } from "../../utils/browser.js";
import { config } from "dotenv";
import { Response } from "express";
import {
  sendStatusMessage,
  sendProgressMessage,
  sendErrorMessage,
  sendCompleteMessage,
} from "../../utils/stream-helpers.js";

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
    sendStatusMessage(res, `Initializing session ${browserIndex} for ${urlItems.length} items`, {
      browser: browserIndex,
      batch: batchNumber,
    });

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);

    if (!browser) {
      sendErrorMessage(res, `Session ${browserIndex} failed to initialize`, {
        browser: browserIndex,
        batch: batchNumber,
      });
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
          sendStatusMessage(res, `Processing ${pageIndex + 1}/${urlItems.length}`, {
            browser: browserIndex,
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100),
          });

          page = await browser!.newPage();
          pages.push(page);

          page.setDefaultTimeout(30000);
          page.setDefaultNavigationTimeout(30000);

          const scrapeData = await scrapingFunction(url, page);

          sendProgressMessage(res, `Completed ${pageIndex + 1}/${urlItems.length}`, {
            browser: browserIndex,
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100),
          });

          return { success: true, data: scrapeData, url };
        } catch (pageScrapeError) {
          const errorMessage =
            pageScrapeError instanceof Error
              ? pageScrapeError.message
              : String(pageScrapeError);

          sendErrorMessage(res, `Item ${pageIndex + 1} failed to process`, {
            browser: browserIndex,
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length,
          });

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

    sendStatusMessage(res, `Session ${browserIndex} completed all tasks`, {
      browser: browserIndex,
      batch: batchNumber,
      current: urlItems.length,
      total: urlItems.length,
      percentage: 100,
    });

    return {
      results,
      browserIndex,
    };
  } catch (browserScrapeError) {
    const errorMessage =
      browserScrapeError instanceof Error
        ? browserScrapeError.message
        : String(browserScrapeError);

    sendErrorMessage(res, `Session ${browserIndex} encountered an error`, {
      browser: browserIndex,
      batch: batchNumber,
    });

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
    sendStatusMessage(res, `Cleaning up session ${browserIndex}`, {
      browser: browserIndex,
      batch: batchNumber,
    });

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
        sendStatusMessage(res, `Session ${browserIndex} closed`, {
          browser: browserIndex,
          batch: batchNumber,
        });
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
  sendStatusMessage(res, `Starting batch ${batchNumber} (${urlItems.length} items)`, {
    batch: batchNumber,
    total: urlItems.length,
    stage: "batch_start",
  });

  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  sendStatusMessage(res, `Allocating ${browserPagesBatches.length} parallel sessions`, {
    batch: batchNumber,
    total: browserPagesBatches.length,
    stage: "browser_allocation",
  });

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

  sendStatusMessage(res, `Batch ${batchNumber} completed`, {
    batch: batchNumber,
    total: flattenedBrowserResults.length,
    stage: "batch_complete",
  });

  sendStatusMessage(res, `Pausing for 10 seconds before next batch`, {
    batch: batchNumber,
    stage: "batch_delay",
  });

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

  sendStatusMessage(res, `Initializing process for ${urlItems.length} items`, {
    total: urlItems.length,
    stage: "initialization",
  });

  sendStatusMessage(res, `Configured for ${MAX_BROWSER_SESSIONS} sessions, ${MAX_PAGES_PER_BROWSER} tasks each`, {
    total: TOTAL_CONCURRENT_URLS,
    stage: "configuration",
  });

  try {
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      batches.push(urlItems.slice(i, i + TOTAL_CONCURRENT_URLS));
    }

    sendStatusMessage(res, `Organized into ${batches.length} batches`, {
      total: batches.length,
      stage: "batching",
    });

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

        sendProgressMessage(res, `Progress: ${successCount} completed, ${errorCount} failed`, {
          current: successCount + errorCount,
          total: urlItems.length,
          percentage: Math.round(
            ((successCount + errorCount) / urlItems.length) * 100
          ),
          batch: batchIndex + 1,
        });
      } catch (batchError) {
        const batchErrorMessage = `Batch ${batchIndex + 1} processing failed: ${
          batchError instanceof Error ? batchError.message : String(batchError)
        }`;

        sendErrorMessage(res, `Batch ${batchIndex + 1} failed`, {
          batch: batchIndex + 1,
          stage: "batch_error",
        });

        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    sendCompleteMessage(res, `Processing complete`, {
      current: urlItems.length,
      total: urlItems.length,
      percentage: 100,
      stage: "complete",
    });

    const successRate = ((successCount / urlItems.length) * 100).toFixed(1);
    sendStatusMessage(res, `Results: ${successCount} succeeded, ${errorCount} failed (${successRate}% success)`, {
      current: successCount,
      total: urlItems.length,
      percentage: Math.round((successCount / urlItems.length) * 100),
      stage: "final_summary",
    });

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

    sendErrorMessage(res, `System error occurred`, {
      stage: "critical_error",
    });

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

// Save to database immediately after successful scrape
// try {
//   await upsertScrapingResults(db, item.country, item.state, item.city, item.query, scrapeData);
//   console.log(`💾 Database updated for ${item.city}, ${item.state} - ${item.query}`);
// } catch (dbError) {
//   console.error(`❌ Database save failed for ${item.city}, ${item.state}:`, dbError);
//   // Continue processing even if DB save fails
// }
