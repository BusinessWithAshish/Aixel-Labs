import puppeteer, { Browser, Page } from "puppeteer";
import { getBrowserOptions } from "../../utils/browser.js";
import { config } from "dotenv";
import { Response } from "express";
import { DEFAULT_PAGE_LOAD_TIMEOUT } from "../../utils/constants.js";

config();

// Configuration constants
const MAX_BROWSER_SESSIONS = Number(process.env.MAX_BROWSER_SESSIONS) || 10;
const MAX_PAGES_PER_BROWSER = Number(process.env.MAX_PAGES_PER_BROWSER) || 5;
const MAX_RETRIES = Number(process.env.MAX_RETRIES) || 3;
const RETRY_DELAY = Number(process.env.RETRY_DELAY) || 3000;
const TOTAL_CONCURRENT_URLS = MAX_BROWSER_SESSIONS * MAX_PAGES_PER_BROWSER;

type ScrapingFunction<T> = (url: string, page: Page) => Promise<T>;

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
  scrapingFunction: ScrapingFunction<T>,
  res: Response | null = null
): Promise<SingleBrowserResult<T>> => {
  let browser: Browser | null = null;
  const pages: Page[] = [];

  try {

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);
    console.log(`\t\t\t Launching browser ${browserIndex} with ${urlItems.length} URLs`);

    if (!browser) {
      const finalErrorMessage = `[Browser ${browserIndex} of batch ${batchNumber}]: Browser launch failed`;
      console.log(`\t\t\t ${finalErrorMessage}`);
      return {
        results: [],
        error: finalErrorMessage,
        browserIndex,
      };
    }

    const pagePromises = urlItems.map(
      async (url, pageIndex): Promise<EachPageResult<T>> => {
        let page: Page | null = null;

        try {

          page = await browser!.newPage();
          pages.push(page);

          page.setDefaultTimeout(DEFAULT_PAGE_LOAD_TIMEOUT);
          page.setDefaultNavigationTimeout(DEFAULT_PAGE_LOAD_TIMEOUT);

          // Retry the scraping function if it fails
          // No need to reload the page on retry attempts
          let lastError: Error | null = null;

          for (
            let retryAttempt = 0;
            retryAttempt < MAX_RETRIES;
            retryAttempt++
          ) {
            try {
              // Add delay on retry attempts (but not on the first attempt)
              if (retryAttempt > 0) {
                console.log(
                  `\t\t\t\t ⟳ [Page ${pageIndex + 1} of Browser ${browserIndex}] retry ${retryAttempt}/${MAX_RETRIES - 1}`,
                );

                // Add a small delay before retry to avoid hammering the server
                await new Promise((resolve) =>
                  setTimeout(resolve, RETRY_DELAY * retryAttempt),
                );

                // Don't reload - let the scraping function handle navigation
                // This avoids conflicts when the scraping function does its own page.goto()
              }

              const scrapeData = await scrapingFunction(url, page);

              // Success - return immediately
              if (retryAttempt > 0) {
                console.log(
                  `\t\t\t\t ✓ [Page ${pageIndex + 1} of Browser ${browserIndex}] succeeded on retry ${retryAttempt}`,
                );
              }

              return {
                success: true,
                data: scrapeData,
                url,
              };
            } catch (error) {
              lastError =
                error instanceof Error ? error : new Error(String(error));

              // Only log if this is the last attempt
              if (retryAttempt === MAX_RETRIES - 1) {
                console.log(
                  `\t\t\t\t ✗ [Page ${pageIndex + 1} of Browser ${browserIndex}] failed: ${lastError.message}`,
                );
              }

              // Continue to the next retry attempt (unless this was the last one)
            }
          }

          // All retries exhausted - return error
          const finalErrorMessage = `[Page ${pageIndex + 1} of Browser ${browserIndex} of batch ${batchNumber}] Failed after ${MAX_RETRIES} attempts: ${lastError?.message || "Unknown error"}`;

          return {
            success: false,
            url,
            error: finalErrorMessage,
          };
        } catch (pageScrapeError) {
          const errorMessage =
            pageScrapeError instanceof Error
              ? pageScrapeError.message
              : String(pageScrapeError);

          const finalErrorMessage = `[Page ${pageIndex + 1} of Browser ${browserIndex} of batch ${batchNumber}] Page had fatal error for ${url}: ${errorMessage}`;
          console.log(`\t\t\t\t ${finalErrorMessage}`);

          return {
            success: false,
            url,
            error: finalErrorMessage,
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

    const finalErrorMessage = `[Browser ${browserIndex} of batch ${batchNumber}] Browser had error: ${errorMessage}`;

    console.log(`\t\t\t ${finalErrorMessage}`);

    return {
      results: [],
      error: finalErrorMessage,
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
  scrapingFunction: ScrapingFunction<T>,
  res: Response | null = null
): Promise<SingleBrowserResult<T>[]> => {
  console.log(
    `\t\t Starting Batch ${batchNumber} with ${urlItems.length} URLs`,
  );

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
  const flattenedBrowserBatchResults = browserResults.flat();

  console.log(
    "\n\t\t🟠 Waiting for 10 seconds before starting the next batch to avoid rate limiting...",
  );
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log("\t\t🟠 10 seconds passed, starting the next batch...");

  return flattenedBrowserBatchResults;
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
  scrapingFunction: ScrapingFunction<T>,
  res: Response | null = null,
): Promise<TBrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();
  console.log(
    "\n\n----- STARTING SCRAPING PROCESS -----",
    new Date(startTime).toISOString(),
  );

  try {
    console.log(`\t🟡 Starting to scrape ${urlItems.length} URLs`);
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      const singleBatch = urlItems.slice(i, i + TOTAL_CONCURRENT_URLS);
      console.log(
        `\t\t Batch ${batches.length + 1}: ${singleBatch.length} URLs`,
      );
      batches.push(singleBatch);
    }
    console.log(`\t🟡 Total ${batches.length} batches`);

    const aggregatedResults: T[] = [];
    const aggregatedErrors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      try {
        console.log(
          "\n\t🟡 Processing browser batch:",
          batchIndex + 1,
          "/",
          batches.length,
        );
        const currentBatchResults = await processBatchOfBrowsers(
          batches[batchIndex],
          batchIndex + 1,
          scrapingFunction,
          res,
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
        
        const batchErrorMessage = `Browser Batch failed: ${batchIndex + 1}/${batches.length} : ${
          batchError instanceof Error ? batchError.message : String(batchError)
        }`;

        console.log(`\t🔴 ${batchErrorMessage}`);

        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    console.log("\n\t 🟢 No new batch is starting");

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    const infoMessage = `\t🟢 Finished processing all batches with success count: ${successCount} and error count: ${errorCount} in ${duration} seconds`;
    console.log(infoMessage);

    console.log(
      `----- ENDING BROWSER BATCH HANDLER ----- ${new Date(endTime).toISOString()}`,
    );

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

    const errorMessage = `Critical error: ${error instanceof Error ? error.message : String(error)}`;

    console.log(`\t🔴 ${errorMessage}`);
    console.log(
      "\n\n----- ENDING BROWSER BATCH HANDLER -----",
      new Date(endTime).toISOString(),
    );

    return {
      duration,
      success: false,
      results: [],
      errors: [errorMessage],
      batches: 0,
      successCount: 0,
      errorCount: 1,
      totalUrls: urlItems.length,
    };
  }
};

export const browserDebugger = async (seconds: number) => {
  console.log(`[🟡 Browser Debugger] Waiting for ${seconds} seconds...`);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  console.log(`[🟡 Browser Debugger] ${seconds} seconds passed, continuing...`);
};
