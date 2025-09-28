import {Page} from "puppeteer";
import {DEFAULT_PAGE_LOAD_TIMEOUT} from "../utils/constants";

export const scrapeLinks = async (url: string, page: Page): Promise<string[]> => {

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.goto(url, { waitUntil: "networkidle2", timeout: DEFAULT_PAGE_LOAD_TIMEOUT });

    return await page.evaluate(async () => {
        const scrollContainer = document.querySelector('div[aria-label^="Results for"]');
        if (!scrollContainer) return [];

        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        const isEndReached = () => {
            return !!document.querySelector('span.HlvSq')?.textContent?.includes("You've reached the end of the list.");
        };

        const getVisibleLeads = () => {
            return Array.from(scrollContainer.children).filter(el => !el.classList.contains('TFQHme'));
        };

        while (!isEndReached()) {
            scrollContainer.scrollBy(0, 1000);
            await sleep(1000);
        }


        const leads = getVisibleLeads();
        const uniqueUrls = new Set<string>();
        const results: string[] = [];

        leads.forEach((el, index) => {
            const anchor = el.querySelector('a[href*="/maps/place/"]');
            if (anchor) {
                const href = anchor.getAttribute('href');
                if (href && !uniqueUrls.has(href)) {
                    uniqueUrls.add(href);

                    results.push(href.startsWith('http') ? href : 'https://www.google.com' + href);
                }
            }
        });

        return results;
    });

}
