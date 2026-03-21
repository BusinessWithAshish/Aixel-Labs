// import { load } from "cheerio";
// import type { Request, Response } from "express";
// import {
//   Session,
//   ClientIdentifier,
//   initTLS,
//   destroyTLS,
// } from "node-tls-client";

// // ─────────────────────────────────────────────────────────────
// //  Call once at app startup:  await bootstrapTLS()
// //  Call once at app shutdown: await shutdownTLS()
// // ─────────────────────────────────────────────────────────────

// export async function bootstrapTLS(): Promise<void> {
//   await initTLS();
//   console.log("[TLS] Initialized");
// }

// export async function shutdownTLS(): Promise<void> {
//   await destroyTLS();
//   console.log("[TLS] Destroyed");
// }

// // ─────────────────────────────────────────────────────────────
// //  TYPES
// // ─────────────────────────────────────────────────────────────

// export interface SearchResult {
//   position: number;
//   title: string;
//   url: string;
//   displayUrl: string;
//   snippet: string;
// }

// export interface SearchPage {
//   page: number;
//   results: SearchResult[];
//   totalResultsText: string | null;
//   hasNextPage: boolean;
// }

// export interface SearchResponse {
//   query: string;
//   totalPages: number;
//   totalResults: number;
//   blocked: boolean;
//   blockedAtPage: number | null;
//   pages: SearchPage[];
//   allResults: SearchResult[];
// }

// export interface SearchOptions {
//   /** Number of pages to fetch (default: 1, max: 10) */
//   pages?: number;
//   /** Results per page — Google supports 10 or 20 (default: 10) */
//   num?: number;
//   /** Interface language (default: "en") */
//   hl?: string;
//   /** Country code (default: "us") */
//   gl?: string;
//   /** Delay in ms between page requests (default: 1500) */
//   delayMs?: number;
//   /** Time filter: "qdr:h" hour, "qdr:d" day, "qdr:w" week, "qdr:m" month, "qdr:y" year */
//   tbs?: string;
//   /** Restrict to filetype e.g. "pdf" */
//   filetype?: string;
//   /** Restrict to site e.g. "reddit.com" */
//   site?: string;
// }

// // ─────────────────────────────────────────────────────────────
// //  CONSTANTS — confirmed via live browser recon
// // ─────────────────────────────────────────────────────────────

// const BASE_URL = "https://www.google.com/search";

// // Confirmed from browser test: valid pages are 299–303 KB
// // Anything below 200 KB = soft block or CAPTCHA page
// const MIN_VALID_HTML_BYTES = 200_000;

// // Confirmed selectors from browser DOM inspection
// const SELECTORS = {
//   card: "div.tF2Cxc",
//   title: "h3.LC20lb",
//   link: "a.zReHs",
//   displayUrl: "cite.tjvcx",
//   snippet: "div.VwiC3b",
//   stats: "#result-stats",
//   nextPage: "a#pnnext",
// };

// // Chrome 145 UA — matches the TLS profile we're mimicking
// const USER_AGENTS = [
//   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
//   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
//   "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
// ];

// // ─────────────────────────────────────────────────────────────
// //  HELPERS
// // ─────────────────────────────────────────────────────────────

// function randomUA(): string {
//   return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
// }

// function sleep(ms: number): Promise<void> {
//   return new Promise((r) => setTimeout(r, ms));
// }

// function buildUrl(query: string, page: number, opts: SearchOptions): string {
//   let q = query;
//   if (opts.site) q += ` site:${opts.site}`;
//   if (opts.filetype) q += ` filetype:${opts.filetype}`;

//   const params = new URLSearchParams({
//     q,
//     start: String((page - 1) * (opts.num ?? 10)),
//     num: String(opts.num ?? 10),
//     hl: opts.hl ?? "en",
//     gl: opts.gl ?? "us",
//     filter: "0", // disable duplicate filtering — confirmed needed
//     nfpr: "1", // disable autocorrect — confirmed needed
//   });

//   if (opts.tbs) params.set("tbs", opts.tbs);

//   return `${BASE_URL}?${params.toString()}`;
// }

// function isBlocked(html: string, htmlSize: number): boolean {
//   if (htmlSize < MIN_VALID_HTML_BYTES) return true;
//   if (html.includes("detected unusual traffic")) return true;
//   if (html.includes("recaptcha")) return true;
//   if (html.includes("consent.google.com")) return true;
//   if (html.includes("Sorry, we could not")) return true;
//   return false;
// }

// function parseHtml(html: string, page: number, num: number): SearchPage {
//   const $ = load(html);
//   const results: SearchResult[] = [];

//   $(SELECTORS.card).each((i, el) => {
//     const title = $(el).find(SELECTORS.title).text().trim() || null;
//     const url = $(el).find(SELECTORS.link).attr("href") || null;
//     const displayUrl = $(el).find(SELECTORS.displayUrl).text().trim() || null;
//     const snippet = $(el).find(SELECTORS.snippet).text().trim() || null;

//     if (!title || !url) return;

//     results.push({
//       position: (page - 1) * num + i + 1,
//       title,
//       url,
//       displayUrl: displayUrl ?? "",
//       snippet: snippet ?? "",
//     });
//   });

//   const totalResultsText = $(SELECTORS.stats).text().trim() || null;
//   const hasNextPage = $(SELECTORS.nextPage).length > 0;

//   return { page, results, totalResultsText, hasNextPage };
// }

// // ─────────────────────────────────────────────────────────────
// //  SESSION FACTORY
// //
// //  Two fixes vs the broken version:
// //  1. headers go in SessionOptions at construction — not set
// //     as a property afterward (Session has no .headers setter)
// //  2. headerOrder is string[] at runtime — the lib's typedef
// //     says OutgoingHttpHeaders[] but that's a doc bug; all
// //     official examples pass plain strings. We cast via `as any`
// //     to satisfy TS without breaking runtime behavior.
// // ─────────────────────────────────────────────────────────────

// function createSession(userAgent: string): Session {
//   return new Session({
//     clientIdentifier: ClientIdentifier.chrome_124,
//     randomTlsExtensionOrder: true,
//     proxy:
//       "http://businesswi5:xYPLYvYQaw22xqDfWfi5_country-IN_session-FHH9ZIH3R@rp.evomi.com:1000",

//     timeout: 30_000,
//     insecureSkipVerify: false,

//     headers: {
//       "User-Agent": userAgent,
//       Accept:
//         "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
//       "Accept-Language": "en-US,en;q=0.9",
//       "Accept-Encoding": "gzip, deflate, br",
//       DNT: "1",
//       Connection: "keep-alive",
//       "Upgrade-Insecure-Requests": "1",
//       "Cache-Control": "max-age=0",
//     },
//     headerOrder: [
//       "user-agent",
//       "accept",
//       "accept-language",
//       "accept-encoding",
//       "dnt",
//       "connection",
//       "upgrade-insecure-requests",
//       "cache-control",
//       "cookie",
//     ] as any,
//   });
// }

// // ─────────────────────────────────────────────────────────────
// //  COOKIE WARM-UP
// //  Hits google.com homepage so the session picks up real
// //  DV + __Secure-STRP cookies before the first search request.
// //  This mirrors what a browser does on a fresh tab.
// // ─────────────────────────────────────────────────────────────

// async function warmUpSession(session: Session): Promise<void> {
//   try {
//     // Step 1: Hit google.com — fresh navigation, no referrer
//     await session.get("https://www.google.com/", {
//       headers: {
//         "Sec-Fetch-Dest": "document",
//         "Sec-Fetch-Mode": "navigate",
//         "Sec-Fetch-Site": "none", // ✅ none — fresh tab, no referrer
//         "Sec-Fetch-User": "?1",
//       },
//       followRedirects: true,
//     });

//     await sleep(800 + Math.random() * 700);

//     // Step 2: Hit search page as if user typed in address bar
//     await session.get("https://www.google.com/search?q=test", {
//       headers: {
//         Referer: "https://www.google.com/",
//         "Sec-Fetch-Dest": "document",
//         "Sec-Fetch-Mode": "navigate",
//         "Sec-Fetch-Site": "same-origin", // ✅ same-origin — navigating within google.com
//         "Sec-Fetch-User": "?1",
//       },
//       followRedirects: true,
//     });

//     await sleep(500 + Math.random() * 500);
//   } catch (e) {
//     console.warn("[GoogleScraper] Warm-up failed (non-fatal):", e);
//   }
// }

// // ─────────────────────────────────────────────────────────────
// //  CORE SCRAPER
// // ─────────────────────────────────────────────────────────────

// export async function googleSearch(
//   query: string,
//   opts: SearchOptions = {},
// ): Promise<SearchResponse> {
//   const totalPages = Math.min(opts.pages ?? 1, 10);
//   const num = opts.num ?? 10;
//   const delayMs = opts.delayMs ?? 1500;
//   const ua = randomUA();
//   const session = createSession(ua);

//   const response: SearchResponse = {
//     query,
//     totalPages: 0,
//     totalResults: 0,
//     blocked: false,
//     blockedAtPage: null,
//     pages: [],
//     allResults: [],
//   };

//   try {
//     // ── Warm up the IP with natural browsing behaviour ──
//     console.log("[GoogleScraper] Warming up session...");

//     const homeRes = await session.get("https://www.google.com/", {
//       headers: {
//         "Sec-Fetch-Dest": "document",
//         "Sec-Fetch-Mode": "navigate",
//         "Sec-Fetch-Site": "none",
//         "Sec-Fetch-User": "?1",
//       },
//       followRedirects: true,
//     });
//     const homeHtml = await homeRes.text();
//     console.log(
//       "[DEBUG] Homepage size:",
//       Buffer.byteLength(homeHtml, "utf8"),
//       "| contains enablejs:",
//       homeHtml.includes("enablejs"),
//     );

//     await sleep(1000 + Math.random() * 1000);

//     const dummyRes = await session.get(
//       "https://www.google.com/search?q=weather&hl=en&gl=us",
//       {
//         headers: {
//           Referer: "https://www.google.com/",
//           "Sec-Fetch-Dest": "document",
//           "Sec-Fetch-Mode": "navigate",
//           "Sec-Fetch-Site": "same-origin",
//           "Sec-Fetch-User": "?1",
//         },
//         followRedirects: true,
//       },
//     );
//     const dummyHtml = await dummyRes.text();
//     console.log(
//       "[DEBUG] Dummy search size:",
//       Buffer.byteLength(dummyHtml, "utf8"),
//       "| contains enablejs:",
//       dummyHtml.includes("enablejs"),
//       "| status:",
//       dummyRes.status,
//     );

//     await sleep(1500 + Math.random() * 1000);

//     console.log("[GoogleScraper] Warm-up done. Starting real search...");
//     let prevUrl = "https://www.google.com/search?q=weather";

//     for (let page = 1; page <= totalPages; page++) {
//       const url = buildUrl(query, page, opts);
//       console.log(`[GoogleScraper] Page ${page}/${totalPages} → ${url}`);

//       const res = await session.get(url, {
//         headers: {
//           Referer: prevUrl,
//           "Sec-Fetch-Dest": "document",
//           "Sec-Fetch-Mode": "navigate",
//           "Sec-Fetch-Site": "same-origin",
//           "Sec-Fetch-User": "?1",
//         },
//         followRedirects: true,
//       });

//       const html = await res.text();
//       const htmlSize = Buffer.byteLength(html, "utf8");
//       console.log(
//         `[DEBUG] Page ${page} size: ${htmlSize} | status: ${res.status}`,
//       );

//       if (isBlocked(html, htmlSize)) {
//         console.warn(
//           `[GoogleScraper] BLOCKED on page ${page} | size: ${htmlSize}`,
//         );
//         response.blocked = true;
//         response.blockedAtPage = page;
//         break;
//       }

//       const parsed = parseHtml(html, page, num);
//       response.pages.push(parsed);
//       response.allResults.push(...parsed.results);
//       console.log(
//         `[GoogleScraper] ✅ Page ${page}: ${parsed.results.length} results | ${Math.round(htmlSize / 1024)}KB`,
//       );

//       if (!parsed.hasNextPage) break;
//       prevUrl = url;
//       if (page < totalPages) await sleep(delayMs + Math.random() * 500);
//     }
//   } finally {
//     await session.close();
//   }

//   response.totalPages = response.pages.length;
//   response.totalResults = response.allResults.length;
//   return response;
// }

// // ─────────────────────────────────────────────────────────────
// //  EXPRESS HANDLER
// //
// //  Mount in your app:
// //    app.get("/api/search", searchHandler)
// //
// //  Example calls:
// //    GET /api/search?q=site:instagram.com&pages=10
// //    GET /api/search?q=typescript&pages=3&tbs=qdr:w
// //    GET /api/search?q=openai&site=reddit.com&pages=2
// //    GET /api/search?q=annual+report&filetype=pdf&pages=1
// // ─────────────────────────────────────────────────────────────

// export async function searchHandler(
//   req: Request,
//   res: Response,
// ): Promise<void> {
//   const {
//     q = "site:instagram.com 'coffee' 'Zurich'",
//     pages = "1",
//     num = "10",
//     hl = "en",
//     gl = "in",
//     delay = "1500",
//     tbs,
//     filetype,
//     site,
//   } = req.query as Record<string, string>;

//   if (!q?.trim()) {
//     res.status(400).json({ error: "Missing required param: q" });
//     return;
//   }

//   const parsedPages = Math.min(Math.max(parseInt(pages) || 1, 1), 10);
//   const parsedNum = [10, 20].includes(parseInt(num)) ? parseInt(num) : 10;
//   const parsedDelay = Math.max(parseInt(delay) || 1500, 1000); // min 1s between pages

//   try {
//     console.log(
//       `[SearchHandler] q="${q}" pages=${parsedPages} num=${parsedNum}`,
//     );

//     const result = await googleSearch(q.trim(), {
//       pages: parsedPages,
//       num: parsedNum,
//       hl,
//       gl,
//       delayMs: parsedDelay,
//       tbs,
//       filetype,
//       site,
//     });

//     res.json({
//       success: true,
//       query: result.query,
//       totalResults: result.totalResults,
//       totalPages: result.totalPages,
//       blocked: result.blocked,
//       blockedAtPage: result.blockedAtPage,
//       results: result.allResults,
//       pages: result.pages.map((p) => ({
//         page: p.page,
//         resultCount: p.results.length,
//         totalResultsText: p.totalResultsText,
//         hasNextPage: p.hasNextPage,
//       })),
//     });
//   } catch (err: any) {
//     console.error("[SearchHandler] Unhandled error:", err);
//     res
//       .status(500)
//       .json({ success: false, error: err.message ?? "Internal error" });
//   }
// }
