// import { Request, Response } from "express";
// import {
//   INSTAGRAM_SCRAPE_SEARCH_FOR,
//   INSTAGRAM_SCRAPE_RESPONSE,
// } from "@aixellabs/shared/instagram";
// import {
//   DEFAULT_PAGE_LOAD_TIMEOUT,
//   GOOGLE_SEARCH_BASE_URL,
// } from "../../utils/constants.js";
// import { instagramScrapeLinks } from "./scrape-links.js";
// import { instagramDetailsLeadExtractor } from "./lead-extractor.js";
// import {
//   BrowserBatchHandler,
//   browserDebugger,
// } from "../../utils/browser-batch-handler.js";
// import { Page } from "puppeteer";
// import {
//   createInstagramProxySessionPool,
//   fetchInstagramProfilesWithRetry,
//   logStep,
//   POOL_TARGET_RATIO,
//   MAX_FAILURE_RETRY_ROUNDS,
// } from "./instagram.js";
// import { ALApiResponse } from "../types";
// import { INSTAGRAM_REQUEST, INSTAGRAM_RESPONSE } from "./types";
// import { INSTAGRAM_REQUEST_SCHEMA } from "./schemas";
// import { generateInstagramSearchQuery } from "./helpers";

// // ─── Handler: POST /instagram/scrape ───────────────────────

// export const instagramScrapeHandler = async (req: Request, res: Response) => {
//   const requestBody = req.body;

//   const parsedBody = INSTAGRAM_REQUEST_SCHEMA.safeParse(requestBody);

//   if (!parsedBody.success) {
//     res.status(400).json({ success: false, error: "Invalid query parameters" });
//     return;
//   }

//   if (parsedBody?.data?.urls?.length && parsedBody?.data?.urls?.length > 0) {
//     const payload: INSTAGRAM_SCRAPE_RESPONSE = {
//       founded: ["Api is not implemented yet"],
//       foundedLeadsCount: 0,
//       allLeads: [],
//       allLeadsCount: 0,
//     };

//     const response: ALApiResponse<INSTAGRAM_SCRAPE_RESPONSE> = {
//       success: true,
//       data: payload,
//     };

//     res.status(200).json(response);
//     return;
//   }

//   if (parsedBody?.data?.query) {
//     const query = generateInstagramSearchQuery(
//       parsedBody.data as INSTAGRAM_REQUEST & { searchFor: INSTAGRAM_SCRAPE_SEARCH_FOR },
//     );

//     const finalUrl = `${GOOGLE_SEARCH_BASE_URL}?q=${encodeURIComponent(query)}`;

//     console.log("🔍 [Instagram API] Final URL:", finalUrl);

//     try {
//       const founded = await instagramScrapeLinks(finalUrl);

//       if (!founded.length) {
//         res.status(400).json({
//           success: false,
//           error: "No Instagram URLs found",
//         });
//         return;
//       }

//       const allLeads = await instagramDetailsLeadExtractor(founded);

//       if (!allLeads.length) {
//         res.status(400).json({
//           success: false,
//           error: "No Instagram leads found",
//         });
//         return;
//       }

//       const payload: INSTAGRAM_SCRAPE_RESPONSE = {
//         founded: founded,
//         foundedLeadsCount: founded.length,
//         allLeads: allLeads,
//         allLeadsCount: allLeads.length,
//       };

//       const response: ALApiResponse<INSTAGRAM_SCRAPE_RESPONSE> = {
//         success: true,
//         data: payload,
//       };

//       res.status(200).json(response);
//     } catch (error) {
//       console.error("🔴 [Instagram API] Error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Scraping failed due to system error: " + error,
//       });
//     }
//   }
// };

// // ─── Handler: GET /v2/instagram/scrape ─────────────────────

// export const instagramScrapeV2Handler = async (req: Request, res: Response) => {
//   const body = req.body as { url?: string; urls?: string[] };
//   const inputUrls = body?.urls ?? (body?.url ? [body.url] : []);
//   const sampleInstagramProfileUrls =
//     inputUrls.length > 0
//       ? inputUrls
//       : [
//           "https://www.instagram.com/leomessi/",
//           "https://www.instagram.com/neymarjr/",
//           "https://www.instagram.com/messirinoceleste/",
//           "https://www.instagram.com/tanmaybhat/",
//         ];
//   const sampleInstagramProfileLength = sampleInstagramProfileUrls.length;

//   const apiStart = Date.now();
//   try {
//     logStep(
//       "API INSTAGRAM_SCRAPE_V2 — start",
//       ` | profileCount=${sampleInstagramProfileLength}`,
//     );

//     const instagram_session_pool = await createInstagramProxySessionPool(
//       sampleInstagramProfileLength,
//     );

//     if (instagram_session_pool.length === 0) {
//       res.status(200).json({
//         success: true,
//         data: {
//           profiles: [],
//           step2: {
//             targetPoolSize: Math.ceil(
//               sampleInstagramProfileLength * POOL_TARGET_RATIO,
//             ),
//             poolSize: 0,
//             instagram_session_pool: [],
//           },
//           failed: [],
//           message: "No working proxy sessions; cannot fetch profiles.",
//         },
//       });
//       return;
//     }

//     const { successes, failed } = await fetchInstagramProfilesWithRetry(
//       sampleInstagramProfileUrls,
//       instagram_session_pool,
//       { maxRetryRounds: MAX_FAILURE_RETRY_ROUNDS },
//     );

//     logStep(
//       "API INSTAGRAM_SCRAPE_V2 — done",
//       ` | profiles=${successes.length}, failed=${failed.length}, total ${((Date.now() - apiStart) / 1000).toFixed(1)}s`,
//       Date.now() - apiStart,
//     );

//     res.status(200).json({
//       success: true,
//       data: {
//         profiles: successes,
//         step2: {
//           targetPoolSize: Math.ceil(
//             sampleInstagramProfileLength * POOL_TARGET_RATIO,
//           ),
//           poolSize: instagram_session_pool.length,
//           instagram_session_pool: instagram_session_pool.map((s) => ({
//             proxy: s.proxy,
//             userAgent: s.userAgent,
//             proxyResponseTimeMs: s.proxyResponseTimeMs,
//             targetUrlResponseTimeMs: s.targetUrlResponseTimeMs,
//             hasCookies: Object.keys(s.targetUrlInfo.cookies ?? {}).length > 0,
//             hasTokens: Object.keys(s.targetUrlInfo.tokens ?? {}).length > 0,
//           })),
//         },
//         failed: failed.map((f) => ({
//           username: f.username,
//           error: f.error,
//         })),
//       },
//     });
//   } catch (error) {
//     console.error("[INSTAGRAM_SCRAPE_V2] Failed:", error);
//     res.status(500).json({
//       success: false,
//       error: error instanceof Error ? error.message : "Unknown error",
//     });
//   }
// };

// // ─── Handler: POST /instagram/advanced/scrape ──────────────
// // (Advanced handler using BrowserBatchHandler for pagination)

// export const instagramAdvancedHandler = async (req: Request, res: Response) => {
//   const requestBody = req.body;

//   const parsedBody = INSTAGRAM_REQUEST_SCHEMA.safeParse(requestBody);

//   if (!parsedBody.success) {
//     res.status(400).json({ success: false, error: "Invalid query parameters" });
//     return;
//   }

//   if (parsedBody?.data?.urls?.length && parsedBody?.data?.urls?.length > 0) {
//     const response: INSTAGRAM_SCRAPE_RESPONSE = {
//       founded: ["Api is not implemented yet"],
//       foundedLeadsCount: 0,
//       allLeads: [],
//       allLeadsCount: 0,
//     };
//     res.status(200).json(response);
//     return;
//   }

//   if (parsedBody?.data?.query) {
//     const queryData = parsedBody.data.query;

//     const sampleQuery = `site:instagram.com (cafe OR restaurant) "Zurich"`;
//     const queryUrl = `https://www.google.com/search?q=${encodeURIComponent(
//       sampleQuery,
//     )}`;

//     try {
//       // NOTE: scrapeLeadsFromPage is referenced but may not yet be exported from scrape-links.
//       // This handler is a work-in-progress.
//       const { instagramScrapeLinks: scrapeLinksForBrowser } =
//         await import("./scrape-links.js");

//       const firstPageResult = await BrowserBatchHandler(
//         [queryUrl],
//         async (url: string, page: Page) => {
//           // Placeholder: this handler needs scrapeLeadsFromPage which is WIP
//           return {
//             leads: [] as INSTAGRAM_RESPONSE[],
//             paginationUrls: [] as string[],
//           };
//         },
//         res,
//       );

//       if (!firstPageResult.success || firstPageResult.results.length === 0) {
//         res.status(400).json({
//           success: false,
//           error:
//             "Failed to scrape first page. All errors: " +
//             firstPageResult.errors.join(", "),
//         });
//         return;
//       }

//       const firstPageData = firstPageResult.results[0];
//       const allLeads: INSTAGRAM_RESPONSE[] = [...firstPageData.leads];

//       const response: INSTAGRAM_SCRAPE_RESPONSE = {
//         founded: allLeads.map((lead) => lead.username || ""),
//         foundedLeadsCount: allLeads.length,
//         allLeads: allLeads,
//         allLeadsCount: allLeads.length,
//       };

//       res.status(200).json(response);
//     } catch (error) {
//       console.error("🔴 [Instagram API] Error:", error);
//       res.status(500).json({
//         success: false,
//         error: "Scraping failed due to system error",
//       });
//     }
//   }
// };
