import puppeteer, {Browser, Page} from "puppeteer";
import {getBrowserOptions} from "../../utils/browser";
import {config} from "dotenv";
import {Response} from "express";

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
    res: Response | null = null
): Promise<SingleBrowserResult<T>> => {

  let browser: Browser | null = null;
  const pages: Page[] = [];

  try {
    sendStreamMessage(res, {
      type: 'status',
      message: `Starting browser ${browserIndex} to process ${urlItems.length} items`,
      data: { browser: browserIndex, batch: batchNumber },
      timestamp: new Date().toISOString()
    });

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);

    if (!browser) {
      sendStreamMessage(res, {
        type: 'error',
        message: `Failed to start browser ${browserIndex} - system error`,
        data: { browser: browserIndex, batch: batchNumber },
        timestamp: new Date().toISOString()
      });
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
        sendStreamMessage(res, {
          type: 'status',
          message: `Processing item ${pageIndex + 1} of ${urlItems.length} in browser ${browserIndex}`,
          data: { 
            browser: browserIndex, 
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100)
          },
          timestamp: new Date().toISOString()
        });

        page = await browser!.newPage();
        pages.push(page);

        // Set page timeout and other configurations
        page.setDefaultTimeout(60000);
        page.setDefaultNavigationTimeout(60000);

        const scrapeData = await scrapingFunction(url, page);

        sendStreamMessage(res, {
          type: 'progress',
          message: `Successfully processed item ${pageIndex + 1} in browser ${browserIndex}`,
          data: { 
            browser: browserIndex, 
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length,
            percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100)
          },
          timestamp: new Date().toISOString()
        });

        return { success: true, data: scrapeData };

      } catch (pageScrapeError) {
        const errorMessage = pageScrapeError instanceof Error ? pageScrapeError.message : String(pageScrapeError);
        
        sendStreamMessage(res, {
          type: 'error',
          message: `Failed to process item ${pageIndex + 1} in browser ${browserIndex}`,
          data: { 
            browser: browserIndex, 
            batch: batchNumber,
            current: pageIndex + 1,
            total: urlItems.length
          },
          timestamp: new Date().toISOString()
        });
        
        return { success: false, error: `Page had error for this url ${url} at Browser ${browserIndex} for page ${pageIndex + 1} : ${errorMessage}` };
      }
    });

    const results = await Promise.all(pagePromises);

    sendStreamMessage(res, {
      type: 'status',
      message: `Browser ${browserIndex} completed processing all ${urlItems.length} items`,
      data: { 
        browser: browserIndex, 
        batch: batchNumber,
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100
      },
      timestamp: new Date().toISOString()
    });

    return {
      results,
      browserIndex
    };

  } catch (browserScrapeError) {
    const errorMessage = browserScrapeError instanceof Error ? browserScrapeError.message : String(browserScrapeError);

    sendStreamMessage(res, {
      type: 'error',
      message: `Browser ${browserIndex} encountered a critical error and stopped`,
      data: { 
        browser: browserIndex, 
        batch: batchNumber
      },
      timestamp: new Date().toISOString()
    });

    return {
      results: [],
      error: errorMessage,
      browserIndex
    };

  } finally {
    // Cleanup pages first
    sendStreamMessage(res, {
      type: 'status',
      message: `Cleaning up browser ${browserIndex} resources`,
      data: { browser: browserIndex, batch: batchNumber },
      timestamp: new Date().toISOString()
    });

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
        sendStreamMessage(res, {
          type: 'status',
          message: `Browser ${browserIndex} closed successfully`,
          data: { browser: browserIndex, batch: batchNumber },
          timestamp: new Date().toISOString()
        });
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
    res: Response | null = null
): Promise<SingleBrowserResult<T>[]> => {
  sendStreamMessage(res, {
    type: 'status',
    message: `Starting batch ${batchNumber} with ${urlItems.length} items`,
    data: { 
      batch: batchNumber,
      total: urlItems.length,
      stage: 'batch_start'
    },
    timestamp: new Date().toISOString()
  });

  // Split URLs into groups for each browser
  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  sendStreamMessage(res, {
    type: 'status',
    message: `Batch ${batchNumber} will use ${browserPagesBatches.length} browsers`,
    data: { 
      batch: batchNumber,
      total: browserPagesBatches.length,
      stage: 'browser_allocation'
    },
    timestamp: new Date().toISOString()
  });

  // Process all browsers in this batch concurrently
  const browserPromises = browserPagesBatches.map((batchUrls, index) =>
    processSingleBrowser(batchUrls, index + 1, batchNumber, scrapingFunction, res)
  );

  const browserResults = await Promise.all(browserPromises);
  const flattenedBrowserResults = browserResults.flat();

  sendStreamMessage(res, {
    type: 'status',
    message: `Batch ${batchNumber} completed successfully`,
    data: { 
      batch: batchNumber,
      total: flattenedBrowserResults.length,
      stage: 'batch_complete'
    },
    timestamp: new Date().toISOString()
  });

  // Add delay between batches to prevent overwhelming the system
  sendStreamMessage(res, {
    type: 'status',
    message: `Waiting 10 seconds before starting next batch`,
    data: { 
      batch: batchNumber,
      stage: 'batch_delay'
    },
    timestamp: new Date().toISOString()
  });
  
  await new Promise(resolve => setTimeout(resolve, 10));

  // Check for device temperature here, if greater than certain threshold then sleep for 10 minutes and then
  // continue further

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
}

// Streaming message types
type StreamMessage = {
  type: 'progress' | 'status' | 'error' | 'complete';
  message: string;
  data?: {
    current?: number;
    total?: number;
    percentage?: number;
    stage?: string;
    batch?: number;
    browser?: number;
  };
  timestamp: string;
}

// Helper function to send streaming messages
const sendStreamMessage = (res: Response | null, message: StreamMessage) => {
  if (res && !res.headersSent) {
    try {
      res.write(`data: ${JSON.stringify(message)}\n\n`);
    } catch (error) {
      console.warn('Failed to send stream message:', error);
    }
  }
  // Always log to console as well
  console.log(`📡 [${message.type.toUpperCase()}] ${message.message}`);
};

export const BrowserBatchHandler = async <T>(
    urlItems: string[],
    scrapingFunction: (url: string, page: Page) => Promise<T>,
    res: Response | null = null
): Promise<TBrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();
  
  sendStreamMessage(res, {
    type: 'status',
    message: `Starting processing of ${urlItems.length} items`,
    data: { 
      total: urlItems.length,
      stage: 'initialization'
    },
    timestamp: new Date().toISOString()
  });

  sendStreamMessage(res, {
    type: 'status',
    message: `System configured for ${MAX_BROWSER_SESSIONS} browsers with ${MAX_PAGES_PER_BROWSER} pages each`,
    data: { 
      total: TOTAL_CONCURRENT_URLS,
      stage: 'configuration'
    },
    timestamp: new Date().toISOString()
  });

  try {
    // Split all URLs into batches that can be processed simultaneously
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      batches.push(urlItems.slice(i, i + TOTAL_CONCURRENT_URLS));
    }

    sendStreamMessage(res, {
      type: 'status',
      message: `Organized items into ${batches.length} batches for processing`,
      data: { 
        total: batches.length,
        stage: 'batching'
      },
      timestamp: new Date().toISOString()
    });

    const aggregatedResults: T[] = [];
    const aggregatedErrors: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each batch sequentially to manage resource usage
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      try {
        const currentBatchResults = await processBatchOfBrowsers(batches[batchIndex], batchIndex + 1, scrapingFunction, res);
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

        sendStreamMessage(res, {
          type: 'progress',
          message: `Batch ${batchIndex + 1} completed: ${successCount} successful, ${errorCount} failed`,
          data: { 
            current: successCount + errorCount,
            total: urlItems.length,
            percentage: Math.round(((successCount + errorCount) / urlItems.length) * 100),
            batch: batchIndex + 1
          },
          timestamp: new Date().toISOString()
        });

      } catch (batchError) {
        const batchErrorMessage = `Batch ${batchIndex + 1} processing failed: ${batchError instanceof Error ? batchError.message : String(batchError)}`;
        
        sendStreamMessage(res, {
          type: 'error',
          message: `Batch ${batchIndex + 1} failed completely`,
          data: { 
            batch: batchIndex + 1,
            stage: 'batch_error'
          },
          timestamp: new Date().toISOString()
        });

        // Add error for this entire batch
        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    sendStreamMessage(res, {
      type: 'complete',
      message: `Processing completed successfully!`,
      data: { 
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100,
        stage: 'complete'
      },
      timestamp: new Date().toISOString()
    });

    sendStreamMessage(res, {
      type: 'status',
      message: `Final results: ${successCount} successful, ${errorCount} failed (${((successCount / urlItems.length) * 100).toFixed(1)}% success rate)`,
      data: { 
        current: successCount,
        total: urlItems.length,
        percentage: Math.round((successCount / urlItems.length) * 100),
        stage: 'final_summary'
      },
      timestamp: new Date().toISOString()
    });

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

    sendStreamMessage(res, {
      type: 'error',
      message: `Critical system error occurred during processing`,
      data: { 
        stage: 'critical_error'
      },
      timestamp: new Date().toISOString()
    });

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