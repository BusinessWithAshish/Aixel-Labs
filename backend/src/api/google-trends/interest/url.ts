import { GOOGLE_TRENDS_BASE_URL } from "../constants";
import {
  GOOGLE_TRENDS_EXPLORE_PATH,
  GOOGLE_TRENDS_WIDGETDATA_BASE_PATH,
} from "../constants";
import type {
  GOOGLE_TRENDS_COMPARISON_ITEM,
  GOOGLE_TRENDS_INTEREST_REQUEST,
  GOOGLE_TRENDS_PROPERTY_VALUE,
} from "./types";
import type { GOOGLE_TRENDS_COMPARE_REQUEST } from "./schemas";

/** Builds the `/trends/api/explore` request payload (the `req` query param). */
export function buildExploreRequestPayload(
  comparisonItems: GOOGLE_TRENDS_COMPARISON_ITEM[],
  category: number,
  property: GOOGLE_TRENDS_PROPERTY_VALUE,
): {
  comparisonItems: GOOGLE_TRENDS_COMPARISON_ITEM[];
  category: number;
  property: GOOGLE_TRENDS_PROPERTY_VALUE;
} {
  return { comparisonItems, category, property };
}

/** Builds the `/trends/api/explore` URL with the encoded `req` payload. */
export function buildExploreUrl(
  payload: ReturnType<typeof buildExploreRequestPayload>,
  hl: string,
  tz: number,
): string {
  const url = new URL(GOOGLE_TRENDS_EXPLORE_PATH, GOOGLE_TRENDS_BASE_URL);
  url.searchParams.set("hl", hl);
  url.searchParams.set("tz", String(tz));
  url.searchParams.set("req", JSON.stringify(payload));
  return url.toString();
}

/** Builds a widgetdata URL for a given widget type suffix. */
function buildWidgetdataUrl(
  suffix: string,
  token: string,
  reqJson: string,
  hl: string,
  tz: number,
): string {
  const url = new URL(
    `${GOOGLE_TRENDS_WIDGETDATA_BASE_PATH}${suffix}`,
    GOOGLE_TRENDS_BASE_URL,
  );
  url.searchParams.set("hl", hl);
  url.searchParams.set("tz", String(tz));
  url.searchParams.set("token", token);
  url.searchParams.set("req", reqJson);
  return url.toString();
}

/** `/trends/api/widgetdata/multiline/timeseries/json` URL. */
export function buildTimeseriesUrl(
  token: string,
  reqJson: string,
  hl: string,
  tz: number,
): string {
  return buildWidgetdataUrl(
    "/multiline/timeseries/json",
    token,
    reqJson,
    hl,
    tz,
  );
}

/** `/trends/api/widgetdata/relatedsearches/json` URL (related queries). */
export function buildRelatedSearchesUrl(
  token: string,
  reqJson: string,
  hl: string,
  tz: number,
): string {
  return buildWidgetdataUrl("/relatedsearches/json", token, reqJson, hl, tz);
}

/** `/trends/api/widgetdata/relatedsearches/geo/json` URL (geo distribution). */
export function buildGeoMapUrl(
  token: string,
  reqJson: string,
  hl: string,
  tz: number,
): string {
  return buildWidgetdataUrl(
    "/relatedsearches/geo/json",
    token,
    reqJson,
    hl,
    tz,
  );
}

/** Builds comparison items for a single-query interest request. */
export function buildSingleComparisonItems(
  request: GOOGLE_TRENDS_INTEREST_REQUEST,
): GOOGLE_TRENDS_COMPARISON_ITEM[] {
  return [
    {
      keyword: request.keyword,
      geo: request.geo,
      time: request.timeframe,
    },
  ];
}

/** Builds comparison items for a multi-query compare request. */
export function buildCompareComparisonItems(
  request: GOOGLE_TRENDS_COMPARE_REQUEST,
): GOOGLE_TRENDS_COMPARISON_ITEM[] {
  return request.keywords.map((keyword) => ({
    keyword,
    geo: request.geo,
    time: request.timeframe,
  }));
}
