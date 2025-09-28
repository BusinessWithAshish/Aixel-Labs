import {Page} from "puppeteer";
import {DEFAULT_PAGE_LOAD_TIMEOUT} from "../utils/constants";
import {JSDOM} from "jsdom";

export type TGoogleMapLeadInfo = {
    website: string;
    phoneNumber: string;
    name: string;
    gmapsUrl: string;
    overAllRating: string;
    numberOfReviews: string;
}

export const gmapsSetupRequestInterception = async (page: Page) => {
    await page.setRequestInterception(true);

    page.on('request', (req) => {
        const resourceType = req.resourceType();
        const url = req.url();

        // Block unnecessary resources
        if (
            resourceType === 'stylesheet' ||
            resourceType === 'font' ||
            resourceType === 'image' ||
            resourceType === 'media' ||
            url.includes('.css') ||
            url.includes('.eot') ||
            url.includes('analytics') ||
            url.includes('google-analytics') ||
            url.includes('googletagmanager') ||
            url.includes('doubleclick') ||
            url.includes('facebook.com') ||
            url.includes('twitter.com') ||
            url.includes('.jpg') ||
            url.includes('.jpeg') ||
            url.includes('.png') ||
            url.includes('.gif') ||
            url.includes('.webp') ||
            url.includes('.svg') ||
            url.includes('.ico')
        ) {
            req.abort();
        } else {
            req.continue();
        }
    });
};


export const GmapsDetailsLeadInfoExtractor = async (url: string, page: Page): Promise<TGoogleMapLeadInfo> => {

    await gmapsSetupRequestInterception(page);
    await page.goto(url, { waitUntil: "networkidle2", timeout: DEFAULT_PAGE_LOAD_TIMEOUT });

    // Get HTML and URL, then immediately close page
    let fullPageHTML = await page.content();
    const gmapsUrl = page.url();

    // Close page immediately for speed
    await page.close();

    // Parse HTML using JSDOM locally
    // const dom = new JSDOM(fullPageHTML);
    // Remove all style tags and CSS to prevent parsing errors
    fullPageHTML = fullPageHTML
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '')
        .replace(/style=["'][^"']*["']/gi, '');

    const dom = new JSDOM(fullPageHTML, {
        resources: "usable",
        runScripts: "outside-only",
        pretendToBeVisual: false,
    });

    const document = dom.window.document;

    // Check if place is temporarily closed
    const isPlaceTemporarilyClosed = document.querySelector('div[aria-label="Notice"]');
    if (isPlaceTemporarilyClosed) {
        return {
            website: 'N/A',
            phoneNumber: 'N/A',
            name: 'N/A',
            gmapsUrl: gmapsUrl ?? 'N/A',
            overAllRating: 'N/A',
            numberOfReviews: 'N/A'
        };
    }

    // Extract data from HTML using JSDOM
    const website = document.querySelector('a[aria-label^="Website:"]')?.getAttribute('href') ?? 'N/A';

    const phoneNumber = document.querySelector('button[aria-label^="Phone:"]')?.getAttribute('aria-label')?.replace('Phone: ', '').replace(/\s/g, '') ?? 'N/A';

    const overAllRating = document.getElementsByClassName('ceNzKf')?.[0]?.getAttribute('aria-label')?.split(' ')?.[0]?.trim() ?? 'N/A';

    const numberOfReviews = document.querySelector('span[aria-label*="reviews"]')?.getAttribute('aria-label')?.split(' ')[0] ?? 'N/A';

    const name = document.querySelector('div[aria-label^="Information for"]')?.getAttribute('aria-label')?.replace('Information for ', '') ?? 'N/A';

    return {
        website,
        phoneNumber,
        name,
        gmapsUrl: gmapsUrl ?? 'N/A',
        overAllRating,
        numberOfReviews
    };
}