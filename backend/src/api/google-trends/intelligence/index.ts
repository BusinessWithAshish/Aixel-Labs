import type { IRouter } from "express";
import { GOOGLE_TRENDS_API_ROUTES } from "../constants";
import { googleTrendsInterestIntelligenceHandler } from "./single/handler";
import { googleTrendsCompareIntelligenceHandler } from "./compare/handler";

export function registerGoogleTrendsIntelligenceRoutes(router: IRouter) {
  router.post(
    GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_INTEREST,
    googleTrendsInterestIntelligenceHandler,
  );
  router.post(
    GOOGLE_TRENDS_API_ROUTES.INTELLIGENCE_COMPARE,
    googleTrendsCompareIntelligenceHandler,
  );
}

export { googleTrendsInterestIntelligenceService } from "./single/service";
export { googleTrendsCompareIntelligenceService } from "./compare/service";
export type {
  GOOGLE_TRENDS_INTEREST_INTELLIGENCE_FIELDS,
  GOOGLE_TRENDS_INTEREST_INTELLIGENCE_RESPONSE,
  GOOGLE_TRENDS_COMPARE_INTELLIGENCE_FIELDS,
  GOOGLE_TRENDS_COMPARE_INTELLIGENCE_RESPONSE,
  GOOGLE_TRENDS_COMPARED_QUERY,
  GOOGLE_TRENDS_DOMINANCE_RANKING_ENTRY,
  GOOGLE_TRENDS_MOMENTUM_RANKING_ENTRY,
  GOOGLE_TRENDS_CROSSOVER_POINT,
  GOOGLE_TRENDS_BREAKOUT,
  GOOGLE_TRENDS_PLATFORM_COMPARISON,
  GOOGLE_TRENDS_GEOGRAPHIC_CONCENTRATION,
  GOOGLE_TRENDS_SEASONAL_PATTERN,
  GOOGLE_TRENDS_RISING_QUERY,
  GOOGLE_TRENDS_TREND_DIRECTION_VALUE,
  GOOGLE_TRENDS_LIFECYCLE_STAGE_VALUE,
} from "./types";
