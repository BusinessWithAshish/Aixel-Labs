import { Page } from "puppeteer";
import {
  DEFAULT_ELEMENT_LOAD_TIMEOUT,
  DEFAULT_PAGE_LOAD_TIMEOUT,
} from "../utils/constants.js";
import { randomUserAgentGenerator } from "./common/stealth-handlers.js";

export const scrapeLinks = async (
  url: string,
  page: Page
): Promise<string[]> => {
  const randomUserAgent = randomUserAgentGenerator();
  await page.setUserAgent(randomUserAgent);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  await page.waitForSelector('div[aria-label^="Results for"]', {
    timeout: DEFAULT_ELEMENT_LOAD_TIMEOUT,
    visible: true,
  });

  return await page.evaluate(async () => {
    const scrollContainer = document.querySelector(
      'div[aria-label^="Results for"]'
    );
    if (!scrollContainer) return [];

    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const isEndReached = () => {
      return !!document
        .querySelector("span.HlvSq")
        ?.textContent?.includes("You've reached the end of the list.");
    };

    const getVisibleLeads = () => {
      return Array.from(scrollContainer.children).filter(
        (el) => !el.classList.contains("TFQHme")
      );
    };

    let scrollAttempts = 0;
    const maxScrollAttempts = 50;

    while (!isEndReached() && scrollAttempts < maxScrollAttempts) {
      scrollContainer.scrollBy(0, 1000);
      await sleep(1000);
      scrollAttempts++;
    }

    const leads = getVisibleLeads();
    const uniqueUrls = new Set<string>();
    const results: string[] = [];

    leads.forEach((el, index) => {
      const anchor = el.querySelector('a[href*="/maps/place/"]');
      if (anchor) {
        const href = anchor.getAttribute("href");
        if (href && !uniqueUrls.has(href)) {
          uniqueUrls.add(href);

          results.push(
            href.startsWith("http") ? href : "https://www.google.com" + href
          );
        }
      }
    });

    return results;
  });
};
