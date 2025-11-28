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
    sendStreamMessage(res, {
      type: "status",
      message: `Initializing session ${browserIndex} for ${urlItems.length} items`,
      data: { browser: browserIndex, batch: batchNumber },
      timestamp: new Date().toISOString(),
    });

    const browserOptions = await getBrowserOptions();
    browser = await puppeteer.launch(browserOptions);

    if (!browser) {
      sendStreamMessage(res, {
        type: "error",
        message: `Session ${browserIndex} failed to initialize`,
        data: { browser: browserIndex, batch: batchNumber },
        timestamp: new Date().toISOString(),
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
          sendStreamMessage(res, {
            type: "status",
            message: `Processing ${pageIndex + 1}/${urlItems.length}`,
            data: {
              browser: browserIndex,
              batch: batchNumber,
              current: pageIndex + 1,
              total: urlItems.length,
              percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100),
            },
            timestamp: new Date().toISOString(),
          });

          page = await browser!.newPage();
          pages.push(page);

          page.setDefaultTimeout(30000);
          page.setDefaultNavigationTimeout(30000);

          const scrapeData = await scrapingFunction(url, page);

          sendStreamMessage(res, {
            type: "progress",
            message: `Completed ${pageIndex + 1}/${urlItems.length}`,
            data: {
              browser: browserIndex,
              batch: batchNumber,
              current: pageIndex + 1,
              total: urlItems.length,
              percentage: Math.round(((pageIndex + 1) / urlItems.length) * 100),
            },
            timestamp: new Date().toISOString(),
          });

          return { success: true, data: scrapeData, url };
        } catch (pageScrapeError) {
          const errorMessage =
            pageScrapeError instanceof Error
              ? pageScrapeError.message
              : String(pageScrapeError);

          sendStreamMessage(res, {
            type: "error",
            message: `Item ${pageIndex + 1} failed to process`,
            data: {
              browser: browserIndex,
              batch: batchNumber,
              current: pageIndex + 1,
              total: urlItems.length,
            },
            timestamp: new Date().toISOString(),
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

    sendStreamMessage(res, {
      type: "status",
      message: `Session ${browserIndex} completed all tasks`,
      data: {
        browser: browserIndex,
        batch: batchNumber,
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100,
      },
      timestamp: new Date().toISOString(),
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

    sendStreamMessage(res, {
      type: "error",
      message: `Session ${browserIndex} encountered an error`,
      data: {
        browser: browserIndex,
        batch: batchNumber,
      },
      timestamp: new Date().toISOString(),
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
    sendStreamMessage(res, {
      type: "status",
      message: `Cleaning up session ${browserIndex}`,
      data: { browser: browserIndex, batch: batchNumber },
      timestamp: new Date().toISOString(),
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
        sendStreamMessage(res, {
          type: "status",
          message: `Session ${browserIndex} closed`,
          data: { browser: browserIndex, batch: batchNumber },
          timestamp: new Date().toISOString(),
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
  sendStreamMessage(res, {
    type: "status",
    message: `Starting batch ${batchNumber} (${urlItems.length} items)`,
    data: {
      batch: batchNumber,
      total: urlItems.length,
      stage: "batch_start",
    },
    timestamp: new Date().toISOString(),
  });

  const browserPagesBatches: string[][] = [];
  for (let i = 0; i < urlItems.length; i += MAX_PAGES_PER_BROWSER) {
    browserPagesBatches.push(urlItems.slice(i, i + MAX_PAGES_PER_BROWSER));
  }

  sendStreamMessage(res, {
    type: "status",
    message: `Allocating ${browserPagesBatches.length} parallel sessions`,
    data: {
      batch: batchNumber,
      total: browserPagesBatches.length,
      stage: "browser_allocation",
    },
    timestamp: new Date().toISOString(),
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

  sendStreamMessage(res, {
    type: "status",
    message: `Batch ${batchNumber} completed`,
    data: {
      batch: batchNumber,
      total: flattenedBrowserResults.length,
      stage: "batch_complete",
    },
    timestamp: new Date().toISOString(),
  });

  sendStreamMessage(res, {
    type: "status",
    message: `Pausing for 10 seconds before next batch`,
    data: {
      batch: batchNumber,
      stage: "batch_delay",
    },
    timestamp: new Date().toISOString(),
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

// Streaming message types
type StreamMessage = {
  type: "progress" | "status" | "error" | "complete";
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
};

// Utility to serialize data for streaming (includes SSE format with data: prefix and \n\n delimiter)
const serializeStreamData = (message: StreamMessage): string => {
  return `data: ${JSON.stringify(message)}\n\n`;
};

// Helper function to send streaming messages
const sendStreamMessage = (res: Response | null, message: StreamMessage) => {
  if (res && !res.headersSent) {
    try {
      res.write(serializeStreamData(message));
    } catch (error) {
      console.warn("Failed to send stream message:", error);
    }
  }
  console.log(`📡 [${message.type.toUpperCase()}] ${message.message}`);
};

export const BrowserBatchHandler = async <T>(
  urlItems: string[],
  scrapingFunction: (url: string, page: Page) => Promise<T>,
  res: Response | null = null
): Promise<TBrowserBatchHandlerReturn<T>> => {
  const startTime = Date.now();

  sendStreamMessage(res, {
    type: "status",
    message: `Initializing process for ${urlItems.length} items`,
    data: {
      total: urlItems.length,
      stage: "initialization",
    },
    timestamp: new Date().toISOString(),
  });

  sendStreamMessage(res, {
    type: "status",
    message: `Configured for ${MAX_BROWSER_SESSIONS} sessions, ${MAX_PAGES_PER_BROWSER} tasks each`,
    data: {
      total: TOTAL_CONCURRENT_URLS,
      stage: "configuration",
    },
    timestamp: new Date().toISOString(),
  });

  try {
    const batches: string[][] = [];
    for (let i = 0; i < urlItems.length; i += TOTAL_CONCURRENT_URLS) {
      batches.push(urlItems.slice(i, i + TOTAL_CONCURRENT_URLS));
    }

    sendStreamMessage(res, {
      type: "status",
      message: `Organized into ${batches.length} batches`,
      data: {
        total: batches.length,
        stage: "batching",
      },
      timestamp: new Date().toISOString(),
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

        sendStreamMessage(res, {
          type: "progress",
          message: `Progress: ${successCount} completed, ${errorCount} failed`,
          data: {
            current: successCount + errorCount,
            total: urlItems.length,
            percentage: Math.round(
              ((successCount + errorCount) / urlItems.length) * 100
            ),
            batch: batchIndex + 1,
          },
          timestamp: new Date().toISOString(),
        });
      } catch (batchError) {
        const batchErrorMessage = `Batch ${batchIndex + 1} processing failed: ${
          batchError instanceof Error ? batchError.message : String(batchError)
        }`;

        sendStreamMessage(res, {
          type: "error",
          message: `Batch ${batchIndex + 1} failed`,
          data: {
            batch: batchIndex + 1,
            stage: "batch_error",
          },
          timestamp: new Date().toISOString(),
        });

        aggregatedErrors.push(batchErrorMessage);
        errorCount += batches[batchIndex].length;
      }
    }

    const endTime = Date.now();
    const duration = Math.round((endTime - startTime) / 1000);

    sendStreamMessage(res, {
      type: "complete",
      message: `Processing complete`,
      data: {
        current: urlItems.length,
        total: urlItems.length,
        percentage: 100,
        stage: "complete",
      },
      timestamp: new Date().toISOString(),
    });

    const successRate = ((successCount / urlItems.length) * 100).toFixed(1);
    sendStreamMessage(res, {
      type: "status",
      message: `Results: ${successCount} succeeded, ${errorCount} failed (${successRate}% success)`,
      data: {
        current: successCount,
        total: urlItems.length,
        percentage: Math.round((successCount / urlItems.length) * 100),
        stage: "final_summary",
      },
      timestamp: new Date().toISOString(),
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

    sendStreamMessage(res, {
      type: "error",
      message: `System error occurred`,
      data: {
        stage: "critical_error",
      },
      timestamp: new Date().toISOString(),
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
