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
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<SingleBrowserResult<T>> => {
  let browser: Browser | null = null;
  const pages: Page[] = [];

  try {

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);
    console.log(`\t\t\t Launching browser ${browserIndex} with ${urlItems.length} URLs`);

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

          console.log(`\t\t\t\t [Browser ${browserIndex} Page ${pageIndex + 1}] scraped successfully`);

          return { 
            success: true, 
            data: scrapeData, 
            url 
          };
        } catch (pageScrapeError) {
          const errorMessage =
            pageScrapeError instanceof Error
              ? pageScrapeError.message
              : String(pageScrapeError);

              console.log(`\t\t\t\t [Browser ${browserIndex} Page ${pageIndex + 1}] had error: ${errorMessage}`);

              const finalErrorMessage = `Page had error for this url ${url} at Browser ${browserIndex} for page ${pageIndex + 1} : ${errorMessage}`;

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

    return {
      results: [],
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


  console.log(`\t\t Starting Batch ${batchNumber} with ${urlItems.length} URLs`);

  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  const browserPromises = browserPagesBatches.map((batchUrls, index) =>
    processSingleBrowser(
      batchUrls,
      index + 1,
      scrapingFunction,
      res
    )
  );

  const browserResults = await Promise.all(browserPromises);
  const flattenedBrowserBatchResults = browserResults.flat();

  console.log('\n\t\t🟠 Waiting for 10 seconds before starting the next batch to avoid rate limiting...');
  await new Promise((resolve) => setTimeout(resolve, 10000));
  console.log('\t\t🟠 10 seconds passed, starting the next batch...');

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
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<TBrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();
  console.log('\n\n----- STARTING SCRAPING PROCESS -----', new Date(startTime).toISOString());

  try {
    console.log(`\t🟡 Starting to scrape ${urlItems.length} URLs`);
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      const singleBatch = urlItems.slice(i, i + TOTAL_CONCURRENT_URLS);
      console.log(`\t\t Batch ${batches.length + 1}: ${singleBatch.length} URLs`);
      batches.push(singleBatch);
    }
    console.log(`\t🟡 Total ${batches.length} batches`);

    const aggregatedResults: T[] = [];
    const aggregatedErrors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      try {
        console.log('\n\t🟡 Processing browser batch:', batchIndex + 1, '/', batches.length);
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
        
        const batchErrorMessage = `Browser Batch failed: ${batchIndex + 1}/${batches.length} : ${
          batchError instanceof Error ? batchError.message : String(batchError)
        }`;

        console.log(`\t🔴 ${batchErrorMessage}`);

        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    console.log('\n\t 🟢 No new batch is starting');

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    const infoMessage = `\t🟢 Finished processing all batches with success count: ${successCount} and error count: ${errorCount} in ${duration} seconds`;
    console.log(infoMessage);

    console.log(`----- ENDING BROWSER BATCH HANDLER ----- ${new Date(endTime).toISOString()}`);

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
    console.log('\n\n----- ENDING BROWSER BATCH HANDLER -----', new Date(endTime).toISOString());

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
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};
