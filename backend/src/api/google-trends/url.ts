import {
  GOOGLE_TRENDS_BASE_URL,
  GOOGLE_TRENDS_QUERY_PARAMS,
  GOOGLE_TRENDS_TRENDING_PATH,
} from "./constants";
import type { GOOGLE_TRENDS_REQUEST } from "./types";

/**
 * Builds the trending-page URL. Only `geo`, `hl`, and `hours` affect the
 * server-rendered HTML — `category` and `sort` are client-side filters in the
 * Google Trends UI, so we apply them ourselves after parsing.
 */
export function buildTrendingUrl(request: GOOGLE_TRENDS_REQUEST): string {
  const url = new URL(GOOGLE_TRENDS_TRENDING_PATH, GOOGLE_TRENDS_BASE_URL);
  url.searchParams.set(GOOGLE_TRENDS_QUERY_PARAMS.GEO, request.geo);
  url.searchParams.set(GOOGLE_TRENDS_QUERY_PARAMS.LANGUAGE, request.hl);
  url.searchParams.set(
    GOOGLE_TRENDS_QUERY_PARAMS.HOURS,
    String(request.hours),
  );
  return url.toString();
}
