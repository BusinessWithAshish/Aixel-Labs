import { Page } from "puppeteer";
import {
  DEFAULT_ELEMENT_LOAD_TIMEOUT,
  DEFAULT_PAGE_LOAD_TIMEOUT,
} from "../utils/constants.js";
import { randomUserAgentGenerator } from "./common/stealth-handlers.js";
import { applyStealthToPage } from "../utils/browser.js";
import { browserDebugger } from "./common/browser-batch-handler.js";

export const scrapeLinks = async (
  url: string,
  page: Page
): Promise<string[]> => {
  // Apply stealth techniques BEFORE navigation
  await applyStealthToPage(page);
  
  const randomUserAgent = randomUserAgentGenerator();
  await page.setUserAgent(randomUserAgent);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  // Wait for results container
  const scrollContainer = await page.waitForSelector('div[aria-label^="Results for"]', {
    timeout: DEFAULT_ELEMENT_LOAD_TIMEOUT,
    visible: true,
  });

  if (!scrollContainer) {
    throw new Error('Scroll container not found');
  }

  // Scroll using Puppeteer API (outside of page.evaluate to avoid detection)
  let scrollAttempts = 0;
  const maxScrollAttempts = 50;
  let previousLinkCount = 0;
  let stagnantScrolls = 0;

  while (scrollAttempts < maxScrollAttempts) {
    // Scroll the container
    await scrollContainer.evaluate((el) => {
      el.scrollBy(0, 1000);
    });

    // Wait a bit for new content to load
    await browserDebugger(1);
    scrollAttempts++;

    // Check if we've reached the end
    const endReached = await page.evaluate(() => {
      const endElement = document.querySelector("span.HlvSq");
      if (!endElement) return false;
      return endElement.textContent?.includes("You've reached the end of the list.") || false;
    });

    if (endReached) {
      break;
    }

    // Every 5 scrolls, check if we're making progress
    if (scrollAttempts % 5 === 0) {
      const currentLinkCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/maps/place/"]').length;
      });

      if (currentLinkCount === previousLinkCount) {
        stagnantScrolls++;
        if (stagnantScrolls >= 3) {
          break;
        }
      } else {
        stagnantScrolls = 0;
        previousLinkCount = currentLinkCount;
      }
    }
  }

  // Extract links (simple, non-looping evaluation)
  try {
    const links = await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
      const uniqueLinks = new Set<string>();
      
      anchors.forEach((anchor) => {
        const href = anchor.getAttribute("href");
        if (href) {
          uniqueLinks.add(
            href.startsWith("http") ? href : "https://www.google.com" + href
          );
        }
      });
      
      return Array.from(uniqueLinks);
    });

    return links;

  } catch (evalError) {
    throw evalError;
  }
};
