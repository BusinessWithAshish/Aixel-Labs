import { type IRouter, Router } from "express";
import { GOOGLE_TRENDS_API_ROUTES } from "./constants";
import { googleTrendsTrendingHandler } from "./handler";
import { registerGoogleTrendsInterestRoutes } from "./interest";
import { registerGoogleTrendsIntelligenceRoutes } from "./intelligence";

const googleTrendsRoutes: IRouter = Router();

googleTrendsRoutes.post(GOOGLE_TRENDS_API_ROUTES.TRENDING, googleTrendsTrendingHandler);
registerGoogleTrendsInterestRoutes(googleTrendsRoutes);
registerGoogleTrendsIntelligenceRoutes(googleTrendsRoutes);

export default googleTrendsRoutes;

export {
  buildTrendingUrl,
  extractAfInitData,
  fetchGoogleTrendsTrending,
  filterByCategory,
  filterByStatus,
  mapTrendEntries,
  mapTrendEntry,
  sortTrends,
} from "./helpers";
export { GOOGLE_TRENDS_REQUEST_SCHEMA } from "./schemas";
export {
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_CATEGORY_NAMES,
  GOOGLE_TRENDS_HOURS,
  GOOGLE_TRENDS_SORT,
  GOOGLE_TRENDS_STATUS,
  GOOGLE_TRENDS_TIMEFRAME,
  GOOGLE_TRENDS_TIMEFRAME_VALUES,
  GOOGLE_TRENDS_PROPERTY,
  GOOGLE_TRENDS_PROPERTY_VALUES,
  GOOGLE_TRENDS_WIDGET_ID,
} from "./constants";
export type {
  GOOGLE_TRENDS_ARTICLE,
  GOOGLE_TRENDS_REQUEST,
  GOOGLE_TRENDS_RESPONSE,
  GOOGLE_TRENDS_TREND,
} from "./types";
export {
  fetchGoogleTrendsInterest,
  fetchGoogleTrendsCompare,
  GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA,
  GOOGLE_TRENDS_COMPARE_REQUEST_SCHEMA,
} from "./interest";
export type {
  GOOGLE_TRENDS_INTEREST_REQUEST,
  GOOGLE_TRENDS_INTEREST_RESPONSE,
  GOOGLE_TRENDS_INTEREST_POINT,
  GOOGLE_TRENDS_RELATED_QUERY,
  GOOGLE_TRENDS_GEO_ENTRY,
  GOOGLE_TRENDS_COMPARISON_ITEM,
} from "./interest";
