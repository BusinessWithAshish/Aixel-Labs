import { Page } from "puppeteer";
import { DEFAULT_PAGE_LOAD_TIMEOUT } from "../../utils/constants.js";
import { GMAPS_SCRAPE_LEAD_INFO } from "@aixellabs/shared/common/apis";
import { pageStealther } from "../common/stealth-handlers.js";
import { browserDebugger } from "../common/browser-batch-handler.js";

// --- Place ID extraction (run in Node, no page.evaluate) ---
const PLACE_ID_REGEX = /"place_id":"(ChI[0-9A-Za-z_-]{10,})"/;
const PLACE_ID_CAMEL_REGEX = /"placeId":"(ChI[0-9A-Za-z_-]{10,})"/;
const URL_PLACE_ID_REGEX = /(ChI[0-9A-Za-z_-]{10,})/;
const URL_DATA_PLACE_ID_REGEX = /!1s(ChI[0-9A-Za-z_-]{10,})/;
const CID_REGEX = /(0x[0-9a-f]+:0x[0-9a-f]+)/i;

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
    // NOTE: FOR NOW REVIEWS SCRAPING IS IN HOLD
    numberOfReviews: null,
  });
};
