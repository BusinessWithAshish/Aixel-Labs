import { type IRouter, Router } from "express";
import { GOOGLE_TRENDS_API_ROUTES } from "./constants";
import { googleTrendsTrendingHandler } from "./handler";

const googleTrendsRoutes: IRouter = Router();

googleTrendsRoutes.post(GOOGLE_TRENDS_API_ROUTES.TRENDING, googleTrendsTrendingHandler);

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
} from "./constants";
export type {
  GOOGLE_TRENDS_ARTICLE,
  GOOGLE_TRENDS_REQUEST,
  GOOGLE_TRENDS_RESPONSE,
  GOOGLE_TRENDS_TREND,
} from "./types";
