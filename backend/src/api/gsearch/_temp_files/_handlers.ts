// import { Request, Response } from "express";
// import { buildUrl, extractUrls, throttledFetch } from "./helpers";

// // Sample advanced query URL for dry-run testing
// const SAMPLE_QUERY_URL =
//   "https://www.google.com/search?q=site%3Ainstagram.com+(cafe+OR+restaurant)+%22Zurich%22";

// const BROWSER_PROFILE = {
//   clientIdentifier: "chrome_131" as ClientIdentifier,
//   userAgent:
//     "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
//   secChUa: '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
//   platform: '"macOS"',
// };

// /** Detects Google block/redirect pages from HTML and response URL */
// function detectPageType(
//   html: string,
//   responseUrl: string,
// ): Record<string, boolean> {
//   const lower = html.toLowerCase();
//   return {
//     captcha:
//       lower.includes("recaptcha") ||
//       lower.includes("g-recaptcha") ||
//       lower.includes("captcha"),
//     unusualTraffic:
//       lower.includes("unusual traffic") ||
//       lower.includes("detected unusual traffic"),
//     sorryPage: lower.includes("sorry/index"),
//     enableJs: lower.includes("enablejs") || lower.includes("enable javascript"),
//     consentRedirect:
//       responseUrl.includes("consent.google") ||
//       lower.includes("consent.google"),
//     notSearch: !responseUrl.includes("google.com/search"),
//   };
// }

// /** Positive signal: does HTML look like real search results? */
// function looksLikeSearchResults(html: string): boolean {
//   return (
//     html.includes("yuRUbf") || // result link container
//     html.includes("LC20lb") || // result title
//     html.includes("data-ved") ||
//     html.includes("/url?q=")
//   );
// }

// const navHeaders = (): Record<string, string> => ({
//   "User-Agent": BROWSER_PROFILE.userAgent,
//   Accept:
//     "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
//   "Accept-Language": "en-US,en;q=0.9",
//   "Accept-Encoding": "gzip, deflate, br, zstd",
//   "Cache-Control": "max-age=0",
//   "Upgrade-Insecure-Requests": "1",
//   "Sec-Fetch-Dest": "document",
//   "Sec-Fetch-Mode": "navigate",
//   "Sec-Fetch-Site": "none",
//   "Sec-Fetch-User": "?1",
//   "Sec-Ch-Ua": BROWSER_PROFILE.secChUa,
//   "Sec-Ch-Ua-Mobile": "?0",
//   "Sec-Ch-Ua-Platform": BROWSER_PROFILE.platform,
//   DNT: "1",
// });

// /**
//  * Dry-run handler: tests if node-tls-client can bypass Google's bot detection
//  * when fetching a Google Search page with an advanced query.
//  *
//  * GET /gsearch/dry-run
//  *
//  * Returns JSON with:
//  * - success: whether we got real results (no CAPTCHA)
//  * - status: HTTP status code
//  * - htmlLength: response body length
//  * - detectedBotBlock: true if "unusual traffic" or "recaptcha" in response
//  * - snippet: first 500 chars of HTML for inspection (when success=false)
//  */
// export const gsearchDryRunHandler = async (req: Request, res: Response) => {
//   await initTLS();

//   const session = new Session({
//     clientIdentifier: BROWSER_PROFILE.clientIdentifier,
//     randomTlsExtensionOrder: true,
//     timeout: 30_000,
//   });

//   try {
//     const resp = await session.get(SAMPLE_QUERY_URL, {
//       headers: navHeaders(),
//     });

//     const html = await resp.text();
//     const responseUrl = resp.url ?? SAMPLE_QUERY_URL;
//     const detected = detectPageType(html, responseUrl);
//     const detectedBotBlock =
//       detected.captcha ||
//       detected.unusualTraffic ||
//       detected.sorryPage ||
//       detected.enableJs ||
//       detected.consentRedirect;
//     const isSearchResults = looksLikeSearchResults(html);
//     const success =
//       resp.status === 200 &&
//       !detectedBotBlock &&
//       html.length > 10_000 &&
//       isSearchResults;

//     return res.json({
//       success,
//       status: resp.status,
//       htmlLength: html.length,
//       detectedBotBlock,
//       detected,
//       isSearchResults,
//       requestUrl: SAMPLE_QUERY_URL,
//       responseUrl: responseUrl !== SAMPLE_QUERY_URL ? responseUrl : undefined,
//       htmlSnippet: html.slice(0, 1200),
//     });
//   } catch (err: unknown) {
//     const msg = err instanceof Error ? err.message : String(err);
//     console.error("[gsearch dry-run] Error:", msg);
//     return res.status(500).json({
//       success: false,
//       error: msg,
//       url: SAMPLE_QUERY_URL,
//     });
//   }
// };

// export const gsearchHandler = async (req: Request, res: Response) => {
//   const { query = 'site:instagram.com "coffee" "Zurich"' } = req.query;
//   const url1 = buildUrl(String(query), 1, 10);

//   const response1 = await throttledFetch(url1);
//   const html1 = await response1.text();

//   // Send back the raw HTML so we can inspect it
//   res.setHeader("content-type", "text/html");
//   return res.send(html1);

//   const {
//     q = 'site:instagram.com "coffee" "Zurich"',
//     page = 1,
//     num = 10,
//   } = req.query;

//   const pageNum = Math.max(1, parseInt(page.toString()));
//   const numResults = Math.min(100, Math.max(1, parseInt(num.toString())));

//   const url = buildUrl(q as string, pageNum, numResults);
//   console.log(`[Google Search] Fetching: ${url}`);

//   try {
//     const response = await throttledFetch(url);

//     if (response.status === 429) {
//       return res
//         .status(429)
//         .json({ error: "Rate limited by Google. Wait before retrying." });
//     }

//     if (!response.ok) {
//       return res
//         .status(502)
//         .json({ error: `Google returned ${response.status}` });
//     }

//     const html = await response.text();

//     if (
//       html.includes("detected unusual traffic") ||
//       html.includes("recaptcha")
//     ) {
//       return res
//         .status(429)
//         .json({ error: "Google CAPTCHA triggered. Slow down or rotate IP." });
//     }

//     const urls = extractUrls(html);

//     res.json({
//       query: q,
//       page: pageNum,
//       num: numResults,
//       start: (pageNum - 1) * numResults,
//       count: urls.length,
//       urls,
//     });
//   } catch (err: any) {
//     console.error("[Google Search] Error:", err.message);
//     res.status(500).json({ error: err.message });
//   }
// };