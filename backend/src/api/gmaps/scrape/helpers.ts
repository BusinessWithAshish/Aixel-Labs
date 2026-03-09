import { GMAPS_SCRAPE_LEAD_INFO } from "./types";
import { GMAPS_SCRAPE_REQUEST } from "./types";
import { Page } from "puppeteer";
import { pageStealther } from "../../../utils/stealth-handlers";
import { randomUserAgentGenerator } from "../../../utils/stealth-handlers";
import {
  DEFAULT_PAGE_LOAD_TIMEOUT,
  DEFAULT_ELEMENT_LOAD_TIMEOUT,
} from "../../../utils/constants";
import { browserDebugger } from "../../../utils/browser-batch-handler";
import { DEFAULT_GOOGLE_MAPS_URL } from "../helpers";

export const scrapeLinks = async (
  url: string,
  page: Page,
): Promise<string[]> => {
  await pageStealther(page);

  const randomUserAgent = randomUserAgentGenerator();
  await page.setUserAgent(randomUserAgent);

  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  const scrollContainer = await page.waitForSelector(
    'div[aria-label^="Results for"]',
    {
      timeout: DEFAULT_ELEMENT_LOAD_TIMEOUT,
      visible: true,
    },
  );

  if (!scrollContainer) {
    throw new Error("Scroll container not found");
  }

  let scrollAttempts = 0;
  const maxScrollAttempts = 50;
  let previousLinkCount = 0;
  let stagnantScrolls = 0;

  while (scrollAttempts < maxScrollAttempts) {
    await scrollContainer.evaluate((el) => {
      el.scrollBy(0, 1000);
    });

    await browserDebugger(1);
    scrollAttempts++;

    const endReached = await page.evaluate(() => {
      const endElement = document.querySelector("span.HlvSq");
      if (!endElement) return false;
      return (
        endElement.textContent?.includes(
          "You've reached the end of the list.",
        ) || false
      );
    });

    if (endReached) {
      break;
    }

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

  try {
    return await page.evaluate(() => {
      const anchors = document.querySelectorAll('a[href*="/maps/place/"]');
      const uniqueLinks = new Set<string>();

      anchors.forEach((anchor) => {
        const href = anchor.getAttribute("href");
        if (href) {
          uniqueLinks.add(
            href.startsWith("http") ? href : "https://www.google.com" + href,
          );
        }
      });

      return Array.from(uniqueLinks);
    });
  } catch (evalError) {
    throw evalError;
  }
};

const PLACE_ID_REGEX = /"place_id":"(ChI[0-9A-Za-z_-]{10,})"/;
const PLACE_ID_CAMEL_REGEX = /"placeId":"(ChI[0-9A-Za-z_-]{10,})"/;
const URL_PLACE_ID_REGEX = /(ChI[0-9A-Za-z_-]{10,})/;
const URL_DATA_PLACE_ID_REGEX = /!1s(ChI[0-9A-Za-z_-]{10,})/;
const CID_REGEX = /(0x[0-9a-f]+:0x[0-9a-f]+)/i;

// ─── Helper: extractPlaceId ───────────────────────────────
function extractPlaceId(url: string | null, html: string): string | null {
  if (!url) return null;
  const queryMatch = url.match(/query_place_id=(ChI[0-9A-Za-z_-]{10,})/);
  if (queryMatch) return queryMatch[1];
  const fromUrl = url.match(URL_PLACE_ID_REGEX);
  if (fromUrl) return fromUrl[1];
  try {
    const dataMatch = decodeURIComponent(url).match(URL_DATA_PLACE_ID_REGEX);
    if (dataMatch) return dataMatch[1];
  } catch {}
  const fromHtml =
    html.match(PLACE_ID_REGEX) ?? html.match(PLACE_ID_CAMEL_REGEX);
  if (fromHtml) return fromHtml[1];
  const cidMatch = url.match(CID_REGEX);
  if (cidMatch) return cidMatch[1];
  return null;
}

// ─── Helper: buildLead ───────────────────────────────
function buildLead(
  placeId: string | null,
  gmapsUrl: string,
  data: {
    website: string | null;
    phoneNumber: string | null;
    placeName: string;
    overAllRating: string | null;
    numberOfReviews: string | null;
  },
): GMAPS_SCRAPE_LEAD_INFO {
  return {
    placeId,
    gmapsUrl,
    website: data.website,
    phoneNumber: data.phoneNumber,
    name: data.placeName,
    overAllRating: data.overAllRating,
    numberOfReviews: data.numberOfReviews,
  };
}

export const GmapsDetailsLeadInfoExtractor = async (
  url: string,
  page: Page,
): Promise<GMAPS_SCRAPE_LEAD_INFO> => {
  await pageStealther(page);
  await page.goto(url, {
    waitUntil: "networkidle2",
    timeout: DEFAULT_PAGE_LOAD_TIMEOUT,
  });

  const gmapsUrl = page.url();
  await browserDebugger(2);

  const noticeEl = await page.$('div[aria-label="Notice"]');
  if (noticeEl) {
    const fullHtml = await page.content();
    return buildLead(extractPlaceId(gmapsUrl, fullHtml), gmapsUrl, {
      website: null,
      phoneNumber: null,
      placeName: "",
      overAllRating: null,
      numberOfReviews: null,
    });
  }

  const website =
    (await page
      .$eval('a[aria-label^="Website:"]', (el) =>
        (el as HTMLAnchorElement).getAttribute("href"),
      )
      .catch(() => null)) ?? null;

  const phoneLabel = await page
    .$eval('button[aria-label^="Phone:"]', (el) =>
      el.getAttribute("aria-label"),
    )
    .catch(() => null);
  const phoneNumber = phoneLabel
    ? phoneLabel.replace(/Phone:\s*/i, "").replace(/\s/g, "")
    : null;

  const ratingLabel = await page
    .$eval(".ceNzKf", (el) => el.getAttribute("aria-label"))
    .catch(() => null);
  const overAllRating = ratingLabel
    ? (ratingLabel.split(/\s/)[0]?.trim() ?? null)
    : null;

  let placeName =
    (await page
      .$eval('div[aria-label^="Information for"]', (el) =>
        el.getAttribute("aria-label"),
      )
      .catch(() => null)) ?? null;
  if (placeName)
    placeName = placeName.replace(/^Information for\s+/i, "").trim();
  if (!placeName)
    placeName =
      (await page
        .$eval("h1", (el) => (el as HTMLElement).innerText?.trim() ?? "")
        .catch(() => "")) ?? "";
  if (!placeName) {
    const title = await page.title();
    placeName =
      (title || "").replace(/\s*[-|–—]\s*Google Maps$/i, "").trim() || "";
  }
  if (!placeName) {
    const href = await page
      .$eval('a[href*="/maps/place/"]', (el) =>
        (el as HTMLAnchorElement).getAttribute("href"),
      )
      .catch(() => null);
    if (href) {
      const m = href.match(/\/place\/([^/]+)(?:\/|$)/);
      if (m) placeName = decodeURIComponent(m[1].replace(/\+/g, " ")).trim();
    }
  }
  if (!placeName) placeName = "";

  const fullHtml = await page.content();
  const placeId = extractPlaceId(gmapsUrl, fullHtml);

  return buildLead(placeId, gmapsUrl, {
    website,
    phoneNumber,
    placeName,
    overAllRating,
    numberOfReviews: null,
  });
};

// ─── Helper: generateGoogleMapsUrls ───────────────────────────────
export const generateGoogleMapsUrls = (
  data: GMAPS_SCRAPE_REQUEST,
): string[] => {
  const urls: string[] = [];

  data.cities?.forEach((city: string) => {
    if (!city) return;
    const formattedQuery = data.query
      ?.toLowerCase()
      .trim()
      .replace(/\s+/g, "+");

    const location = `${city}, ${data.state ?? ""}, ${data.country ?? ""}`;
    const formattedLocation = location.replace(/\s+/g, "+");

    const searchTerm = `${formattedQuery}+in+${formattedLocation}`;
    const encodedSearchTerm = encodeURIComponent(searchTerm).replace(
      /%2B/g,
      "+",
    );

    const finalUrl = `${DEFAULT_GOOGLE_MAPS_URL}${encodedSearchTerm}`;
    urls.push(finalUrl);
  });

  return urls;
};
