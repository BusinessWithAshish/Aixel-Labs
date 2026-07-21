import type { IRouter } from "express";
import { GOOGLE_TRENDS_API_ROUTES } from "../constants";
import { googleTrendsInterestHandler } from "./handler";

export function registerGoogleTrendsInterestRoutes(router: IRouter) {
  router.post(GOOGLE_TRENDS_API_ROUTES.INTEREST, googleTrendsInterestHandler);
}

export {
  fetchGoogleTrendsInterest,
  fetchGoogleTrendsCompare,
  fetchGoogleTrendsInterestCore,
} from "./helpers";
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
export {
  GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
  GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
  GOOGLE_TRENDS_INTEREST_GEO_SCHEMA,
  GOOGLE_TRENDS_INTEREST_HL_SCHEMA,
  GOOGLE_TRENDS_TIMEFRAME_SCHEMA,
  GOOGLE_TRENDS_PROPERTY_SCHEMA,
  GOOGLE_TRENDS_INTEREST_CATEGORY_SCHEMA,
  GOOGLE_TRENDS_INTEREST_LIMIT_SCHEMA,
  GOOGLE_TRENDS_KEYWORD_SCHEMA,
} from "./schemas";
export type { GOOGLE_TRENDS_COMPARE_REQUEST } from "./schemas";
export type {
  GOOGLE_TRENDS_INTEREST_REQUEST,
  GOOGLE_TRENDS_COMPARISON_ITEM,
  GOOGLE_TRENDS_INTEREST_POINT,
  GOOGLE_TRENDS_INTEREST_RESPONSE,
  GOOGLE_TRENDS_RELATED_QUERY,
  GOOGLE_TRENDS_GEO_ENTRY,
  GOOGLE_TRENDS_TIMEFRAME_VALUE,
  GOOGLE_TRENDS_PROPERTY_VALUE,
  GOOGLE_TRENDS_RAW_WIDGET,
  GOOGLE_TRENDS_RAW_EXPLORE_RESPONSE,
} from "./types";
