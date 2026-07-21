import { randomUUID } from "crypto";
import {
  GOOGLE_TRENDS_ACCEPT_HEADER,
  GOOGLE_TRENDS_DS0_KEY,
  GOOGLE_TRENDS_DS1_KEY,
  GOOGLE_TRENDS_USER_AGENT,
} from "./constants";
import { filterByCategory, filterByStatus, sortTrends } from "./filter";
import { extractAfInitData, mapTrendEntries } from "./parse";
import { GOOGLE_TRENDS_REQUEST_SCHEMA } from "./schemas";
import type {
  GOOGLE_TRENDS_RAW_DS0,
  GOOGLE_TRENDS_RAW_DS1,
  GOOGLE_TRENDS_REQUEST,
  GOOGLE_TRENDS_RESPONSE,
} from "./types";
import { buildTrendingUrl } from "./url";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../utils/node-tls-client-session-handler";
import { evomiConfigured } from "../../utils/fetch-session-common";

export { buildTrendingUrl } from "./url";
export { extractAfInitData, mapTrendEntries, mapTrendEntry } from "./parse";
export { filterByCategory, filterByStatus, sortTrends } from "./filter";

/**
 * Fetches the Google Trends "Trending Now" page, parses the embedded
 * `AF_initDataCallback` `ds:0` block, and returns the structured trending
 * entries plus the raw `ds:0` JSON string.
 *
 * The page is server-side rendered — every trending entry for the requested
 * `geo`/`hl`/`hours` window is embedded in the HTML, so a single GET is enough.
 * `category`/`status`/`sort`/`limit` are applied as post-processing.
 */
export async function fetchGoogleTrendsTrending(
  request: GOOGLE_TRENDS_REQUEST,
): Promise<GOOGLE_TRENDS_RESPONSE> {
  // Apply Zod defaults so direct (non-Express) callers can omit optional fields.
  const req = GOOGLE_TRENDS_REQUEST_SCHEMA.parse(request);
  const url = buildTrendingUrl(req);

  const session: UrlFetchSession = await createUrlFetchSession({
    useProxy: evomiConfigured(),
    proxyCountry: req.geo,
    proxySessionSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
  });

  let html: string;
  try {
    const response = await session.get(url, {
      headers: {
        "user-agent": GOOGLE_TRENDS_USER_AGENT,
        accept: GOOGLE_TRENDS_ACCEPT_HEADER,
        "accept-language": `${req.hl},${req.hl.split("-")[0]};q=0.9`,
      },
    });
    if (!response.ok) {
      throw new Error(`Google Trends page request failed: ${response.status}`);
    }
    html = await response.text();
  } finally {
    await closeUrlFetchSession(session);
  }

  const ds0Raw = extractAfInitData(html, GOOGLE_TRENDS_DS0_KEY);
  if (!ds0Raw) {
    throw new Error(
      `Could not find AF_initDataCallback '${GOOGLE_TRENDS_DS0_KEY}' block in Google Trends HTML (geo=${req.geo}, hours=${req.hours})`,
    );
  }

  let ds0: GOOGLE_TRENDS_RAW_DS0;
  try {
    ds0 = JSON.parse(ds0Raw) as GOOGLE_TRENDS_RAW_DS0;
  } catch {
    throw new Error("Failed to parse Google Trends ds:0 payload as JSON");
  }

  const ds1Raw = extractAfInitData(html, GOOGLE_TRENDS_DS1_KEY);
  let geoName: string | null = null;
  if (ds1Raw) {
    try {
      const ds1 = JSON.parse(ds1Raw) as GOOGLE_TRENDS_RAW_DS1;
      geoName = typeof ds1[0] === "string" ? ds1[0] : null;
    } catch {
      geoName = null;
    }
  }

  const allTrends = mapTrendEntries(ds0);
  const totalParsed = allTrends.length;

  const filtered = filterByStatus(
    filterByCategory(allTrends, req.category),
    req.status,
  );
  const sorted = sortTrends(filtered, req.sort);
  const limited = sorted.slice(0, req.limit);

  return {
    geo: req.geo,
    geoName,
    hl: req.hl,
    hours: req.hours,
    category: req.category,
    sort: req.sort,
    status: req.status,
    trends: limited,
    totalResults: limited.length,
    totalParsed,
    raw: ds0Raw,
  };
}
