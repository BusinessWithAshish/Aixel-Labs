import { Page } from "puppeteer";
import {
  DEFAULT_PAGE_LOAD_TIMEOUT,
  MAX_INSTA_SEARCH_PAGES_TO_SCRAPE,
} from "../utils/constants.js";
import { randomDelay } from "./common/stealth-handlers.js";
import { INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO } from "@aixellabs/shared/common";

/**
 * Extract pagination URLs from Google search results
 */
export const extractPaginationUrls = async (page: Page): Promise<string[]> => {
  return await page.evaluate((maxPagesToScrape: number) => {
    const urls: string[] = [];
    // find the first table element without any selector
    const table = document.querySelector("table");
    if (!table) return urls;

    // find the first table body element
    const tableBody = table.querySelector("tbody");
    if (!tableBody) return urls;

    // for each table row element, find the first table cell element
    const tableRows = tableBody.querySelectorAll("tr");
    tableRows.forEach((tableRow) => {
      const tableCells = tableRow.querySelectorAll("td");
      if (!tableCells || tableCells.length === 0) return;

      const maxTableCells = Math.min(tableCells.length, maxPagesToScrape);

      for (let i = 0; i < maxTableCells; i++) {
        const tableCell = tableCells[i];
        if (!tableCell) continue;

        const anchor = tableCell.querySelector("a");
        if (anchor && anchor.getAttribute("href")) {
          const GOOGLE_BASE_SEARCH_URL = "https://www.google.com";
          const href = anchor.getAttribute("href");
          urls.push(GOOGLE_BASE_SEARCH_URL + href);
        }
      }
    });
    return urls;
  }, MAX_INSTA_SEARCH_PAGES_TO_SCRAPE);
};

/**
 * Extract contact info from text using regex patterns
 */
const extractContactInfo = (
  text: string
): Pick<
  INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO,
  "email" | "phoneNumber" | "website"
> => {
  const result: Pick<
    INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO,
    "email" | "phoneNumber" | "website"
  > = {
    email: null,
    phoneNumber: null,
    website: null,
  };

  // Email pattern
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    result.email = emailMatch[0] || null;
  }

  // Phone pattern (various formats)
  const phoneRegex =
    /(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    result.phoneNumber = phoneMatch[0] || null;
  }

  // Website pattern (exclude instagram.com)
  const websiteRegex =
    /https?:\/\/(?!.*instagram\.com)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?/;
  const websiteMatch = text.match(websiteRegex);
  if (websiteMatch) {
    result.website = websiteMatch[0] || null;
  }

  return result;
};

/**
 * Scrape Instagram leads from a single Google search results page
 */
export const scrapeLeadsFromPage = async (
  url: string,
  page: Page
): Promise<INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[]> => {
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  const results: INSTAGRAM_SEARCH_SCRAPE_LEAD_INFO[] = [];

  // Find all search result divs using Puppeteer's $$ method
  const searchResults = await page.$$("div.MjjYud");

  for (const resultElement of searchResults) {
    try {
      // Get the title
      const titleElement = await resultElement.$("h3.LC20lb");
      const title = titleElement
        ? await page.evaluate(
            (el) => el.textContent?.trim() || "",
            titleElement
          )
        : null;

      // Get the Instagram URL
      const linkElement = await resultElement.$('a[href*="instagram.com"]');
      const instagramUrl = linkElement
        ? await page.evaluate(
            (el) => el.getAttribute("href") || "",
            linkElement
          )
        : null;

      // Check if it's a valid Instagram user profile URL
      const instaUserProfileUrlRegex =
        /https:\/\/www\.instagram\.com\/[a-zA-Z0-9._]+\/?$/;

      const username = instagramUrl ? instagramUrl.split("/")[3] : null;
      const checkIfInstaUserProfileUrl =
        instagramUrl && instaUserProfileUrlRegex.test(instagramUrl);

      if (!checkIfInstaUserProfileUrl) continue;
      if (!title || !instagramUrl) continue;

      // Get the bio/description text
      const bioElement = await resultElement.$("div.VwiC3b");
      const bio = bioElement
        ? await page.evaluate((el) => el.textContent?.trim() || "", bioElement)
        : null;

      // Extract contact info using the external function
      const { email, phoneNumber, website } = bio
        ? extractContactInfo(bio)
        : {
            email: null,
            phoneNumber: null,
            website: null,
          };

      results.push({
        username,
        instagramUrl,
        bio,
        email,
        phoneNumber,
        website,
      });
    } catch (error) {
      console.error("Error parsing search result:", error);
    }
  }
  return results;
};

/**
 * Main Instagram scraping function
 * This function navigates to Google, searches, and extracts pagination URLs + first page leads
 */
export const instagramScrapeV1 = async (url: string, page: Page) => {
  //   await pageStealther(page);

  const googleSearchUrl = "https://www.google.com";

  await page.goto(googleSearchUrl, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  const puppeteerSearchInput = await page.$('textarea[aria-label="Search"]');

  if (!puppeteerSearchInput) {
    throw new Error("Search input not found on Google page");
  }

  // Type with human-like delays
  await puppeteerSearchInput.type(
    'site:instagram.com (cafe OR restaurant) "Zurich"',
    {
      delay: 50 + Math.random() * 50, // 50-100ms between keystrokes
    }
  );

  // Small delay before pressing Enter
  await randomDelay(300, 600);

  // Press Enter and wait for navigation
  await Promise.all([
    puppeteerSearchInput.press("Enter"),
    page.waitForNavigation({
      waitUntil: "networkidle2",
      timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
    }),
  ]);

  // Step 1: Extract pagination URLs
  const paginationUrls = await extractPaginationUrls(page);

  // Step 2: Scrape the first page (current page)
  const firstPageResult = await scrapeLeadsFromPage(url, page);

  return {
    leads: firstPageResult,
    paginationUrls: paginationUrls,
  };
};
