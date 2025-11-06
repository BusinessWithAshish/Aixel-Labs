import puppeteer, {Browser, Page} from "puppeteer";
import {getBrowserOptions} from "../../utils/browser";
import {config} from "dotenv";
import {Response} from "express";
import {
  BrowserStreamSender,
  BrowserStreamEventType,
  BrowserStreamMetadata,
  createStreamSender,
  createStreamMessage
} from "../../utils/stream-messages";

config();

// Configuration constants
const MAX_BROWSER_SESSIONS = Number(process.env.MAX_BROWSER_SESSIONS) || 10;
const MAX_PAGES_PER_BROWSER = Number(process.env.MAX_PAGES_PER_BROWSER) || 5;
const TOTAL_CONCURRENT_URLS = MAX_BROWSER_SESSIONS * MAX_PAGES_PER_BROWSER;

type EachPageResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
}

type SingleBrowserResult<T> = {
  results: EachPageResult<T>[];
  error?: string;
  browserIndex: number;
}

const processSingleBrowser = async <T>(
    urlItems: string[],
    browserIndex: number,
    batchNumber: number,
    scrapingFunction: (url: string, page: Page) => Promise<T>,
    streamSender: BrowserStreamSender
): Promise<SingleBrowserResult<T>> => {

  let browser: Browser | null = null;
  const pages: Page[] = [];

  try {
    streamSender(createStreamMessage(
      'browser_start',
      `Starting browser ${browserIndex} to process ${urlItems.length} items`,
      { browser: browserIndex, batch: batchNumber }
    ));

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);

    if (!browser) {
      streamSender(createStreamMessage(
        'error',
        `Failed to start browser ${browserIndex} - system error`,
        { browser: browserIndex, batch: batchNumber }
      ));
      return {
        results: [],
        error: `Browser launch failed - browser is null`,
        browserIndex
      };
    }

    // Process each URL with its own page
    const pagePromises = urlItems.map(async (url, pageIndex): Promise<EachPageResult<T>> => {
      let page: Page | null = null;

      try {
        streamSender(createStreamMessage(
          'page_start',
          `Processing item ${pageIndex + 1} of ${urlItems.length} in browser ${browserIndex}`,
          { 
            browser: browserIndex, 
            batch: batchNumber,
            page: pageIndex + 1,
            url: url,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100)
          }
        ));

        page = await browser!.newPage();
        pages.push(page);

        // Set page timeout and other configurations
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        const scrapeData = await scrapingFunction(url, page);

        streamSender(createStreamMessage(
          'page_complete',
          `Successfully processed item ${pageIndex + 1} in browser ${browserIndex}`,
          { 
            browser: browserIndex, 
            batch: batchNumber,
            page: pageIndex + 1,
            url: url,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100)
          }
        ));

        return { success: true, data: scrapeData };

      } catch (pageScrapeError) {
        const errorMessage = pageScrapeError instanceof Error ? pageScrapeError.message : String(pageScrapeError);
        
        streamSender(createStreamMessage(
          'page_error',
          `Failed to process item ${pageIndex + 1} in browser ${browserIndex}`,
          { 
            browser: browserIndex, 
            batch: batchNumber,
            page: pageIndex + 1,
            url: url,
            current: pageIndex + 1,
            total: urlItems.length
          }
        ));
        
        return { success: false, error: `Page had error for this url ${url} at Browser ${browserIndex} for page ${pageIndex + 1} : ${errorMessage}` };
      }
    });

    const results = await Promise.all(pagePromises);

    streamSender(createStreamMessage(
      'browser_complete',
      `Browser ${browserIndex} completed processing all ${urlItems.length} items`,
      { 
        browser: browserIndex, 
        batch: batchNumber,
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100
      }
    ));

    return {
      results,
      browserIndex
    };

  } catch (browserScrapeError) {
    const errorMessage = browserScrapeError instanceof Error ? browserScrapeError.message : String(browserScrapeError);

    streamSender(createStreamMessage(
      'error',
      `Browser ${browserIndex} encountered a critical error and stopped`,
      { 
        browser: browserIndex, 
        batch: batchNumber
      }
    ));

    return {
      results: [],
      error: errorMessage,
      browserIndex
    };

  } finally {
    // Cleanup pages first
    streamSender(createStreamMessage(
      'browser_cleanup',
      `Cleaning up browser ${browserIndex} resources`,
      { browser: browserIndex, batch: batchNumber }
    ));

    for (let i = 0; i < pages.length; i++) {
      try {
        const page = pages[i];
        if (page && !page.isClosed()) {
          await page.close();
        }
      } catch (pageCloseError) {
        console.error(`⚠️ Browser ${browserIndex}-Page ${i + 1}: Error closing page:`, pageCloseError);
      }
    }

    // Then cleanup browser
    if (browser) {
      try {
        await browser.close();
        streamSender(createStreamMessage(
          'browser_cleanup',
          `Browser ${browserIndex} closed successfully`,
          { browser: browserIndex, batch: batchNumber }
        ));
      } catch (browserCloseError) {
        console.error(`⚠️ Browser ${browserIndex}: Error closing browser:`, browserCloseError);
      }
    }
  }
};

const processBatchOfBrowsers = async <T>(
    urlItems: string[],
    batchNumber: number,
    scrapingFunction: (url: string, page: Page) => Promise<T>,
    streamSender: BrowserStreamSender
): Promise<SingleBrowserResult<T>[]> => {
  streamSender(createStreamMessage(
    'batch_start',
    `Starting batch ${batchNumber} with ${urlItems.length} items`,
    { 
      batch: batchNumber,
      total: urlItems.length,
      stage: 'batch_start'
    }
  ));

  // Split URLs into groups for each browser
  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  streamSender(createStreamMessage(
    'status',
    `Batch ${batchNumber} will use ${browserPagesBatches.length} browsers`,
    { 
      batch: batchNumber,
      total: browserPagesBatches.length,
      stage: 'browser_allocation'
    }
  ));

  // Process all browsers in this batch concurrently
  const browserPromises = browserPagesBatches.map((batchUrls, index) =>
    processSingleBrowser(batchUrls, index + 1, batchNumber, scrapingFunction, streamSender)
  );

  const browserResults = await Promise.all(browserPromises);
  const flattenedBrowserResults = browserResults.flat();

  streamSender(createStreamMessage(
    'batch_complete',
    `Batch ${batchNumber} completed successfully`,
    { 
      batch: batchNumber,
      total: flattenedBrowserResults.length,
      stage: 'batch_complete'
    }
  ));

  // Add delay between batches to prevent overwhelming the system
  streamSender(createStreamMessage(
    'batch_delay',
    `Waiting 10 seconds before starting next batch`,
    { 
      batch: batchNumber,
      stage: 'batch_delay'
    }
  ));
  
  await new Promise(resolve => setTimeout(resolve, 10));

  // Check for device temperature here, if greater than certain threshold then sleep for 10 minutes and then
  // continue further

  return flattenedBrowserResults;
};

export type BrowserBatchHandlerReturn<T> = {
  success: boolean;
  results: T[];
  errors: string[];
  successCount: number;
  errorCount: number;
  totalUrls: number;
  batches: number;
  duration: number;
}

export const BrowserBatchHandler = async <T>(
    urlItems: string[],
    scrapingFunction: (url: string, page: Page) => Promise<T>,
    res: Response | null = null
): Promise<BrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();
  const streamSender = createStreamSender<BrowserStreamEventType, BrowserStreamMetadata>(res);
  
  streamSender(createStreamMessage(
    'status',
    `Starting processing of ${urlItems.length} items`,
    { 
      total: urlItems.length,
      stage: 'initialization'
    }
  ));

  streamSender(createStreamMessage(
    'status',
    `System configured for ${MAX_BROWSER_SESSIONS} browsers with ${MAX_PAGES_PER_BROWSER} pages each`,
    { 
      total: TOTAL_CONCURRENT_URLS,
      stage: 'configuration'
    }
  ));

  try {
    // Split all URLs into batches that can be processed simultaneously
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      batches.push(urlItems.slice(i, i + TOTAL_CONCURRENT_URLS));
    }

    streamSender(createStreamMessage(
      'status',
      `Organized items into ${batches.length} batches for processing`,
      { 
        total: batches.length,
        stage: 'batching'
      }
    ));

    const aggregatedResults: T[] = [];
    const aggregatedErrors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each batch sequentially to manage resource usage
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      try {
        const currentBatchResults = await processBatchOfBrowsers(batches[batchIndex], batchIndex + 1, scrapingFunction, streamSender);
        // Extract results and errors from each browser result
        currentBatchResults.forEach(browserResult => {
          // Add errors from this browser
          if (browserResult.error) {
            aggregatedErrors.push(browserResult.error);
          }

          // Process each page result
          browserResult.results.forEach(pageResult => {
            if (pageResult.success && pageResult.data) {
              aggregatedResults.push(pageResult.data);
              successCount++;
            } else if (pageResult.error) {
              aggregatedErrors.push(pageResult.error);
              errorCount++;
            }
          });
        });

        streamSender(createStreamMessage(
          'progress',
          `Batch ${batchIndex + 1} completed: ${successCount} successful, ${errorCount} failed`,
          { 
            current: successCount + errorCount,
            total: urlItems.length,
            percentage: Math.round(((successCount + errorCount) / urlItems.length) * 100),
            batch: batchIndex + 1
          }
        ));

      } catch (batchError) {
        const batchErrorMessage = `Batch ${batchIndex + 1} processing failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`;
        
        streamSender(createStreamMessage(
          'error',
          `Batch ${batchIndex + 1} failed completely`,
          { 
            batch: batchIndex + 1,
            stage: 'batch_error'
          }
        ));

        // Add error for this entire batch
        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    streamSender(createStreamMessage(
      'complete',
      `Processing completed successfully!`,
      { 
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100,
        stage: 'complete'
      }
    ));

    streamSender(createStreamMessage(
      'status',
      `Final results: ${successCount} successful, ${errorCount} failed (${((successCount / urlItems.length) * 100).toFixed(1)}% success rate)`,
      { 
        current: successCount,
        total: urlItems.length,
        percentage: Math.round((successCount / urlItems.length) * 100),
        stage: 'final_summary'
      }
    ));

    return {
      success: errorCount < urlItems.length, // Success if not all URLs failed
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

    streamSender(createStreamMessage(
      'error',
      `Critical system error occurred during processing`,
      { 
        stage: 'critical_error'
      }
    ));

    return {
      duration,
      success: false,
      results: [],
      errors: [error instanceof Error ? error.message : String(error)],
      batches: 0,
      successCount: 0,
      errorCount: urlItems.length, // All URLs failed
      totalUrls: urlItems.length
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