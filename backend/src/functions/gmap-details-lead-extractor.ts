import { Page } from "puppeteer";
import { DEFAULT_PAGE_LOAD_TIMEOUT } from "../utils/constants.js";
import { JSDOM } from "jsdom";
import { GMAPS_SCRAPE_LEAD_INFO } from "@aixellabs/shared/common/apis";

// === Universal Place ID Extractor ===
const PLACE_ID_REGEX = /"place_id":"(ChI[0-9A-Za-z_-]{10,})"/;
const URL_PLACE_ID_REGEX = /(ChI[0-9A-Za-z_-]{10,})/;
const CID_REGEX = /(0x[0-9a-f]+:0x[0-9a-f]+)/i;

export function extractUniversalPlaceId(url: string, html: string) {
    const fromURL = url.match(URL_PLACE_ID_REGEX);
    if (fromURL) return fromURL[1];

    const queryMatch = url.match(/query_place_id=(ChI[0-9A-Za-z_-]{10,})/);
    if (queryMatch) return queryMatch[1];

    const fromHTML = html.match(PLACE_ID_REGEX);
    if (fromHTML) return fromHTML[1];

    const cidMatch = url.match(CID_REGEX);
    if (cidMatch) return cidMatch[1]; // fallback (still useful)

    return null;
}

// === Request Interception ===
export const gmapsSetupRequestInterception = async (page: Page) => {
    await page.setRequestInterception(true);

    page.on("request", (req) => {
        const resourceType = req.resourceType();
        const url = req.url();

    // Block unnecessary resources
    if (
      resourceType === "stylesheet" ||
      resourceType === "font" ||
      resourceType === "image" ||
      resourceType === "media" ||
      url.includes(".css") ||
      url.includes(".eot") ||
      url.includes("analytics") ||
      url.includes("google-analytics") ||
      url.includes("googletagmanager") ||
      url.includes("doubleclick") ||
      url.includes("facebook.com") ||
      url.includes("twitter.com") ||
      url.includes(".jpg") ||
      url.includes(".jpeg") ||
      url.includes(".png") ||
      url.includes(".gif") ||
      url.includes(".webp") ||
      url.includes(".svg") ||
      url.includes(".ico")
    ) {
      req.abort();
    } else {
      req.continue();
    }
  });
};

// === Main Scraper ===
export const GmapsDetailsLeadInfoExtractor = async (
    url: string,
    page: Page
): Promise<GMAPS_SCRAPE_LEAD_INFO> => {
    await gmapsSetupRequestInterception(page);
    await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
    });

    // Full HTML
    let fullPageHTML = await page.content();
    const gmapsUrl = page.url() ?? "N/A";

    // Close early for speed
    await page.close();

    // Clean & parse HTML
    fullPageHTML = fullPageHTML
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
        .replace(/style=["'][^"']*["']/gi, "");

  const dom = new JSDOM(fullPageHTML, {
    resources: "usable",
    runScripts: "outside-only",
    pretendToBeVisual: false,
  });

  const document = dom.window.document;

    // === UNIVERSAL PLACE ID EXTRACTION ===
    const id = extractUniversalPlaceId(gmapsUrl, fullPageHTML) ?? "N/A";

    // Check if place is temporarily closed
    const isPlaceTemporarilyClosed = document.querySelector(
        'div[aria-label="Notice"]'
    );
    if (isPlaceTemporarilyClosed) {
        return {
            id,
            website: "N/A",
            phoneNumber: "N/A",
            name: "N/A",
            gmapsUrl,
            overAllRating: "N/A",
            numberOfReviews: "N/A",
        };
    }

    // Extract other fields
    const website =
        document.querySelector('a[aria-label^="Website:"]')?.getAttribute("href") ??
        "N/A";

    const phoneNumber =
        document
            .querySelector('button[aria-label^="Phone:"]')
            ?.getAttribute("aria-label")
            ?.replace("Phone: ", "")
            ?.replace(/\s/g, "") ?? "N/A";

    const overAllRating =
        document
            .getElementsByClassName("ceNzKf")?.[0]
            ?.getAttribute("aria-label")
            ?.split(" ")?.[0]
            ?.trim() ?? "N/A";

    const numberOfReviews =
        document
            .querySelector('span[aria-label*="reviews"]')
            ?.getAttribute("aria-label")
            ?.split(" ")[0] ?? "N/A";

    const name =
        document
            .querySelector('div[aria-label^="Information for"]')
            ?.getAttribute("aria-label")
            ?.replace("Information for ", "") ?? "N/A";

    return {
        id,
        website,
        phoneNumber,
        name,
        gmapsUrl,
        overAllRating,
        numberOfReviews,
    };
};
