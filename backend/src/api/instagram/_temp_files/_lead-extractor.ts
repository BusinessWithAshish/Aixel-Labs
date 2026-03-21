// import {
//   DEFAULT_PAGE_LOAD_TIMEOUT,
//   SCRAPER_REQUEST_TIMEOUT_MS,
// } from "../../utils/constants.js";
// import { BrowserBatchHandler } from "../../utils/browser-batch-handler.js";
// import { Page } from "puppeteer";
// import { pageStealther } from "../../utils/stealth-handlers.js";
// import {
//   InstagramUser,
// } from "@aixellabs/shared/instagram";
// import { browserDebugger } from "../../utils/browser-batch-handler.js";
// import {INSTAGRAM_RESPONSE} from "./types";

// const INSTAGRAM_API_URL =
//   "https://www.instagram.com/api/v1/users/web_profile_info/";
// const BATCH_SIZE = 10;
// const BATCH_DELAY_MS = 5000;

// type SessionData = {
//   headers: Record<string, string>;
//   cookies: string;
// };

// const extractUsername = (url: string): string | null => {
//   const match = url.match(/instagram\.com\/([a-zA-Z0-9_.-]+)\/?/);
//   return match ? match[1] : null;
// };

// export const InstagramNewSessionPageHandler = async (
//   url: string,
//   page: Page,
// ) => {
//   await page.goto(url, {
//     waitUntil: "networkidle2",
//     timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
//   });

//   await browserDebugger(2);

//   let PersistedSessionData: SessionData = {
//     headers: {},
//     cookies: "",
//   };

//   let headersCaptured = false;
//   page.on("request", (req) => {
//     if (req.url().includes(INSTAGRAM_API_URL) && !headersCaptured) {
//       headersCaptured = true;
//       PersistedSessionData = {
//         headers: req.headers(),
//         cookies: req.headers()["cookie"] || "",
//       };
//       console.log("✅ Captured Instagram API session headers");
//     }
//   });

//   return PersistedSessionData;
// };

// const fetchProfileWithSession = async (
//   username: string,
//   sessionData: SessionData,
// ): Promise<INSTAGRAM_RESPONSE> => {
//   try {
//     const response = await fetch(`${INSTAGRAM_API_URL}?username=${username}`, {
//       method: "GET",
//       headers: {
//         ...sessionData.headers,
//         "User-Agent": sessionData.headers["user-agent"] || "",
//         Cookie: sessionData.cookies,
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     const data = (await response.json()) as InstagramUser;
//     const user = data?.data?.user;

//     if (!user) {
//       throw new Error("No user data found in response");
//     }

//     const leadInfo: INSTAGRAM_RESPONSE = {
//       id: user.id || null,
//       fullName: user.full_name || null,
//       username: user.username || null,
//       email: user.business_email || null,
//       instagramUrl: `https://www.instagram.com/${user.username}/`,
//       websites: user.bio_links.map((link) => link.url) || null,
//       bio: user.biography || null,
//       bioHashtags:
//         user.biography_with_entities.entities.map(
//           (entity) => entity.hashtag.name,
//         ) || null,
//       bioMentions:
//         user.biography_with_entities.entities.map(
//           (entity) => entity.user.username,
//         ) || null,
//       followers: user.edge_followed_by.count || null,
//       following: user.edge_follow.count || null,
//       posts: user.edge_owner_to_timeline_media.count || null,
//       profilePicture: user.profile_pic_url || null,
//       profilePcitureHd: user.profile_pic_url_hd || null,
//       isVerified: user.is_verified || null,
//       isBusiness: user.is_business_account || null,
//       isProfessional: user.is_professional_account || null,
//       isPrivate: user.is_private || null,
//       isJoinedRecently: user.if_joined_recently || null,
//       businessEmail: user.business_email || null,
//       businessPhoneNumber: user.business_phone_number || null,
//       businessCategoryName: user.business_category_name || null,
//       overallCategoryName: user.overall_category_name || null,
//       businessAddressJson: user.business_address_json || null,
//     };

//     return leadInfo;
//   } catch (error) {
//     console.error(`❌ Error fetching profile for ${username}:`, error);
//     throw error;
//   }
// };

// const processBatchWithSession = async (
//   urls: string[],
//   sessionData: SessionData,
// ): Promise<INSTAGRAM_RESPONSE[]> => {
//   const results: INSTAGRAM_RESPONSE[] = [];

//   for (const url of urls) {
//     const username = extractUsername(url);
//     if (!username) {
//       console.warn(`⚠️ Could not extract username from URL: ${url}`);
//       continue;
//     }

//     try {
//       const leadInfo = await fetchProfileWithSession(username, sessionData);
//       results.push(leadInfo);
//       console.log(`✅ Successfully fetched profile: ${username}`);
//     } catch (error) {
//       console.error(`❌ Failed to fetch profile: ${username}`);
//       throw error;
//     }
//   }

//   return results;
// };

// export const instagramDetailsLeadExtractor = async (
//   urls: string[],
// ): Promise<INSTAGRAM_RESPONSE[]> => {
//   if (!urls || urls.length === 0) {
//     return [];
//   }

//   const controller = new AbortController();
//   const timeoutId = setTimeout(
//     () => controller.abort(),
//     SCRAPER_REQUEST_TIMEOUT_MS,
//   );

//   let response: Response;
//   try {
//     response = await fetch(
//       `${process.env.SCRAPER_URL}/api/instagram/profiles`,
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({ inputs: urls }),
//         signal: controller.signal,
//       },
//     );
//   } catch (err) {
//     clearTimeout(timeoutId);
//     const msg =
//       err instanceof Error && err.name === "AbortError"
//         ? `Scraper request timed out after ${SCRAPER_REQUEST_TIMEOUT_MS / 1000}s`
//         : String(err);
//     throw new Error(msg);
//   }
//   clearTimeout(timeoutId);

//   if (!response.ok) {
//     const text = await response.text();
//     throw new Error(
//       `Scraper returned ${response.status}: ${text.slice(0, 200)}`,
//     );
//   }

//   const responseJson = await response.json();
//   const { success, data, error } = responseJson;

//   console.log("allLeadsJson:", data);

//   if (!success || !Array.isArray(data) || data.length === 0) {
//     console.error(
//       "❌ [instagramDetailsLeadExtractor] Scraper failed or returned no data",
//       { success, error, data },
//     );
//     throw new Error(
//       `Instagram profile scraping failed: ${
//         Array.isArray(error) ? error.join(", ") : error
//       }`,
//     );
//   }

//   return data as INSTAGRAM_RESPONSE[];
// };
