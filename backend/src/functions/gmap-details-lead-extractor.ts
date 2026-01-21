import { Page } from "puppeteer";
import { DEFAULT_PAGE_LOAD_TIMEOUT } from "../utils/constants.js";
import { GMAPS_SCRAPE_LEAD_INFO } from "@aixellabs/shared/common/apis";
import { setupRequestInterception } from "./common/stealth-handlers.js";
import { browserDebugger } from "./common/browser-batch-handler.js";

// === Universal Place ID Extractor ===
const PLACE_ID_REGEX = /"place_id":"(ChI[0-9A-Za-z_-]{10,})"/;
const URL_PLACE_ID_REGEX = /(ChI[0-9A-Za-z_-]{10,})/;
const CID_REGEX = /(0x[0-9a-f]+:0x[0-9a-f]+)/i;

export function extractUniversalPlaceId(url: string | null, html: string) {
    if (!url) return null;

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

export const GmapsDetailsLeadInfoExtractor = async (
    url: string,
    page: Page
): Promise<GMAPS_SCRAPE_LEAD_INFO> => {
    await setupRequestInterception(page);
    await page.goto(url, {
        waitUntil: "networkidle2",
        timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
    });

    const gmapsUrl = page.url();
    await browserDebugger(2);

    const extractedData = await page.evaluate(() => {
        // Check if temporarily closed
        if (document.querySelector('div[aria-label="Notice"]')) {
            return { isTemporarilyClosed: true, website: null, phoneNumber: null, overAllRating: null, numberOfReviews: null, name: null };
        }

        // Website
        const websiteEl = document.querySelector('a[aria-label^="Website:"]');
        const website = websiteEl?.getAttribute("href") ?? null;

        // Phone
        const phoneEl = document.querySelector('button[aria-label^="Phone:"]');
        const phoneLabel = phoneEl?.getAttribute("aria-label");
        const phoneNumber = phoneLabel?.replace("Phone: ", "").replace(/\s/g, "") ?? null;

        // Rating
        const ratingEl = document.getElementsByClassName("ceNzKf")?.[0];
        const ratingLabel = ratingEl?.getAttribute("aria-label");
        const overAllRating = ratingLabel?.split(" ")?.[0]?.trim() ?? null;

        // Reviews - multiple fallback selectors
        let numberOfReviews: string | null = null;
        let reviewsEl: Element | null = document.querySelector('span[aria-label*="reviews"]');
        
        if (!reviewsEl) {
            reviewsEl = document.querySelector('button[aria-label*="reviews"]');
        }
        
        if (!reviewsEl) {
            const allSpans = Array.from(document.querySelectorAll('span'));
            reviewsEl = allSpans.find(span => /^\d+\s*reviews?$/i.test((span.textContent || '').trim())) || null;
        }
        
        if (reviewsEl) {
            const reviewLabel = reviewsEl.getAttribute("aria-label");
            if (reviewLabel) {
                numberOfReviews = reviewLabel.split(" ")[0] ?? null;
            } else {
                const match = (reviewsEl.textContent || '').match(/^(\d+)/);
                numberOfReviews = match ? match[1] : null;
            }
        }

        // Name - primary and fallback selector
        let name: string | null = null;
        const nameEl = document.querySelector('div[aria-label^="Information for"]');
        if (nameEl) {
            name = nameEl.getAttribute("aria-label")?.replace("Information for ", "") ?? null;
        } else {
            name = document.querySelector('h1')?.textContent?.trim() ?? null;
        }

        return { isTemporarilyClosed: false, website, phoneNumber, overAllRating, numberOfReviews, name };
    });

    const fullPageHTML = await page.content();
    const placeId = extractUniversalPlaceId(gmapsUrl, fullPageHTML);
    await page.close();

    if (extractedData.isTemporarilyClosed) {
        return {
            placeId,
            website: null,
            phoneNumber: null,
            name: null,
            gmapsUrl,
            overAllRating: null,
            numberOfReviews: null,
        };
    }

    return {
        placeId,
        website: extractedData.website,
        phoneNumber: extractedData.phoneNumber,
        name: extractedData.name,
        gmapsUrl,
        overAllRating: extractedData.overAllRating,
        numberOfReviews: extractedData.numberOfReviews,
    };
};
