import { randomUUID } from "crypto";
import { GOOGLE_TRENDS_WIDGET_ID } from "../constants";
import {
  buildCompareComparisonItems,
  buildExploreRequestPayload,
  buildExploreUrl,
  buildGeoMapUrl,
  buildRelatedSearchesUrl,
  buildSingleComparisonItems,
  buildTimeseriesUrl,
} from "./url";
import {
  findWidget,
  parseExploreResponse,
  parseGeoMap,
  parseRelatedSearches,
  parseTimeseries,
} from "./parse";
import { fetchJsonWithSession } from "./fetch";
import {
  GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
  GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
} from "./schemas";
import type {
  GOOGLE_TRENDS_COMPARISON_ITEM,
  GOOGLE_TRENDS_INTEREST_REQUEST,
  GOOGLE_TRENDS_INTEREST_RESPONSE,
  GOOGLE_TRENDS_PROPERTY_VALUE,
} from "./types";
import type { GOOGLE_TRENDS_COMPARE_REQUEST } from "./schemas";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import { evomiConfigured } from "../../../utils/fetch-session-common";

export {
  buildCompareComparisonItems,
  buildExploreRequestPayload,
  buildExploreUrl,
  buildGeoMapUrl,
  buildRelatedSearchesUrl,
  buildSingleComparisonItems,
  buildTimeseriesUrl,
} from "./url";
export {
  findWidget,
  parseExploreResponse,
  parseGeoMap,
  parseRelatedSearches,
  parseTimeseries,
  parseGrowthPercentage,
  stripAntiHijackPrefix,
  parseTrendsApiJson,
} from "./parse";
export { requestHeaders, fetchJsonWithSession } from "./fetch";

/**
 * Shared core: fetches the explore page to resolve widget tokens, then fetches
 * the TIMESERIES, RELATED_QUERIES, and GEO_MAP widgetdata in parallel.
 *
 * Used by both the single-query and multi-query compare endpoints — the only
 * difference is how `comparisonItems` is built.
 */
export async function fetchGoogleTrendsInterestCore(
  comparisonItems: GOOGLE_TRENDS_COMPARISON_ITEM[],
  category: number,
  property: GOOGLE_TRENDS_PROPERTY_VALUE,
  hl: string,
  tz: number,
  limit: number,
): Promise<GOOGLE_TRENDS_INTEREST_RESPONSE> {
  const geo = comparisonItems[0]?.geo ?? "";

  const session: UrlFetchSession = await createUrlFetchSession({
    useProxy: evomiConfigured(),
    proxyCountry: geo || undefined,
    proxySessionSuffix: randomUUID().replace(/-/g, "").slice(0, 12),
  });

  let rawExplore: string;
  let exploreWidgets;
  try {
    const payload = buildExploreRequestPayload(comparisonItems, category, property);
    const exploreUrl = buildExploreUrl(payload, hl, tz);
    rawExplore = await fetchJsonWithSession(
      session,
      exploreUrl,
      hl,
      "Google Trends explore",
    );
    exploreWidgets = parseExploreResponse(rawExplore).widgets;
  } catch (err) {
    await closeUrlFetchSession(session).catch(() => undefined);
    throw err;
  }

  const timeseriesWidget = findWidget(exploreWidgets, GOOGLE_TRENDS_WIDGET_ID.TIMESERIES);
  const relatedQueriesWidget = findWidget(exploreWidgets, GOOGLE_TRENDS_WIDGET_ID.RELATED_QUERIES);
  const geoMapWidget = findWidget(exploreWidgets, GOOGLE_TRENDS_WIDGET_ID.GEO_MAP);

  // Each widgetdata call needs the widget's `token` and the JSON-stringified
  // `request` object Google embedded for that specific widget.
  const timeseriesReq = timeseriesWidget
    ? buildTimeseriesUrl(
        timeseriesWidget.token,
        JSON.stringify(timeseriesWidget.request ?? {}),
        hl,
        tz,
      )
    : null;
  const relatedReq = relatedQueriesWidget
    ? buildRelatedSearchesUrl(
        relatedQueriesWidget.token,
        JSON.stringify(relatedQueriesWidget.request ?? {}),
        hl,
        tz,
      )
    : null;
  const geoReq = geoMapWidget
    ? buildGeoMapUrl(
        geoMapWidget.token,
        JSON.stringify(geoMapWidget.request ?? {}),
        hl,
        tz,
      )
    : null;

  let interestOverTime: GOOGLE_TRENDS_INTEREST_RESPONSE["interestOverTime"] = [];
  let topRelatedQueries: GOOGLE_TRENDS_INTEREST_RESPONSE["topRelatedQueries"] = [];
  let risingRelatedQueries: GOOGLE_TRENDS_INTEREST_RESPONSE["risingRelatedQueries"] = [];
  let geoDistribution: GOOGLE_TRENDS_INTEREST_RESPONSE["geoDistribution"] = [];

  try {
    const [timeseriesBody, relatedBody, geoBody] = await Promise.all([
      timeseriesReq
        ? fetchJsonWithSession(session, timeseriesReq, hl, "Google Trends timeseries")
        : Promise.resolve(null),
      relatedReq
        ? fetchJsonWithSession(session, relatedReq, hl, "Google Trends related searches")
        : Promise.resolve(null),
      geoReq
        ? fetchJsonWithSession(session, geoReq, hl, "Google Trends geo map")
        : Promise.resolve(null),
    ]);

    if (timeseriesBody) interestOverTime = parseTimeseries(timeseriesBody);
    if (relatedBody) {
      const { top, rising } = parseRelatedSearches(relatedBody, limit);
      topRelatedQueries = top;
      risingRelatedQueries = rising;
    }
    if (geoBody) geoDistribution = parseGeoMap(geoBody, limit);
  } finally {
    await closeUrlFetchSession(session);
  }

  return {
    comparisonItems,
    category,
    property,
    hl,
    tz,
    interestOverTime,
    topRelatedQueries,
    risingRelatedQueries,
    geoDistribution,
    rawExplore,
  };
}

/**
 * Fetches Google Trends interest-over-time data for a single keyword: the
 * interest timeline, top + rising related queries, and geographic
 * distribution.
 */
export async function fetchGoogleTrendsInterest(
  request: GOOGLE_TRENDS_INTEREST_REQUEST,
): Promise<GOOGLE_TRENDS_INTEREST_RESPONSE> {
  const req = GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA.parse(request);
  const comparisonItems = buildSingleComparisonItems(req);
  return fetchGoogleTrendsInterestCore(
    comparisonItems,
    req.category,
    req.property,
    req.hl,
    req.tz,
    req.limit,
  );
}

/**
 * Fetches Google Trends interest-over-time data for 2–5 keywords compared on
 * the same normalised 0–100 scale. The `interestOverTime[].values` and
 * `geoDistribution[].values` arrays are parallel to the input `keywords`
 * order, so callers can map each value back to its source keyword.
 */
export async function fetchGoogleTrendsCompare(
  request: GOOGLE_TRENDS_COMPARE_REQUEST,
): Promise<GOOGLE_TRENDS_INTEREST_RESPONSE> {
  const req = GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA.parse(request);
  const comparisonItems = buildCompareComparisonItems(req);
  return fetchGoogleTrendsInterestCore(
    comparisonItems,
    req.category,
    req.property,
    req.hl,
    req.tz,
    req.limit,
  );
}
