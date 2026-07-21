import { GOOGLE_TRENDS_EXPLORE_RESPONSE_PREFIX } from "../constants";
import type {
  GOOGLE_TRENDS_GEO_ENTRY,
  GOOGLE_TRENDS_INTEREST_POINT,
  GOOGLE_TRENDS_RAW_EXPLORE_RESPONSE,
  GOOGLE_TRENDS_RAW_GEO_MAP,
  GOOGLE_TRENDS_RAW_RELATED_SEARCHES,
  GOOGLE_TRENDS_RAW_TIMESERIES,
  GOOGLE_TRENDS_RAW_WIDGET,
  GOOGLE_TRENDS_RELATED_QUERY,
} from "./types";

/**
 * Strips the `)]}'\n` anti-hijacking prefix Google prepends to its
 * `/trends/api/*` JSON responses, then parses the body as JSON.
 */
export function stripAntiHijackPrefix(body: string): string {
  const trimmed = body.trimStart();
  if (trimmed.startsWith(GOOGLE_TRENDS_EXPLORE_RESPONSE_PREFIX)) {
    return trimmed.slice(GOOGLE_TRENDS_EXPLORE_RESPONSE_PREFIX.length).trimStart();
  }
  return trimmed;
}

/** Parses a Google Trends `/trends/api/*` JSON response (after stripping the prefix). */
export function parseTrendsApiJson<T>(body: string): T {
  const cleaned = stripAntiHijackPrefix(body);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error("Failed to parse Google Trends API response as JSON");
  }
}

/** Parses the `/trends/api/explore` response and returns the widget descriptors. */
export function parseExploreResponse(
  body: string,
): GOOGLE_TRENDS_RAW_EXPLORE_RESPONSE {
  const parsed = parseTrendsApiJson<GOOGLE_TRENDS_RAW_EXPLORE_RESPONSE>(body);
  if (!parsed || !Array.isArray(parsed.widgets)) {
    throw new Error("Google Trends explore response did not contain a `widgets` array");
  }
  return parsed;
}

/** Finds a widget by its `id` field (e.g. "TIMESERIES", "RELATED_QUERIES"). */
export function findWidget(
  widgets: GOOGLE_TRENDS_RAW_WIDGET[],
  id: string,
): GOOGLE_TRENDS_RAW_WIDGET | null {
  return widgets.find((w) => w && w.id === id) ?? null;
}

/** Parses the interest-over-time timeseries widgetdata response. */
export function parseTimeseries(
  body: string,
): GOOGLE_TRENDS_INTEREST_POINT[] {
  const parsed = parseTrendsApiJson<GOOGLE_TRENDS_RAW_TIMESERIES>(body);
  const timeline = parsed.default?.timelineData ?? [];

  const points: GOOGLE_TRENDS_INTEREST_POINT[] = [];
  for (const entry of timeline) {
    const time = Number.parseInt(entry.time ?? "", 10);
    if (!Number.isFinite(time)) continue;
    points.push({
      time,
      formattedTime: entry.formattedTime ?? "",
      values: Array.isArray(entry.value)
        ? entry.value.filter((v: unknown): v is number => typeof v === "number")
        : [],
      formattedValues: Array.isArray(entry.formattedValue)
        ? entry.formattedValue.filter((v: unknown): v is string => typeof v === "string")
        : [],
    });
  }
  return points;
}

/** Parses a growth percentage string like "+5,000%" or "+250%" into a number. */
export function parseGrowthPercentage(formattedValue: string | null | undefined): number | null {
  if (!formattedValue) return null;
  const match = formattedValue.match(/([+-]?[\d,.]+)\s*%/);
  if (!match) return null;
  const num = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

/** Parses the related-searches widgetdata response into top + rising lists. */
export function parseRelatedSearches(
  body: string,
  limit: number,
): {
  top: GOOGLE_TRENDS_RELATED_QUERY[];
  rising: GOOGLE_TRENDS_RELATED_QUERY[];
} {
  const parsed = parseTrendsApiJson<GOOGLE_TRENDS_RAW_RELATED_SEARCHES>(body);
  const rankedLists = parsed.default?.rankedList ?? [];

  const top: GOOGLE_TRENDS_RELATED_QUERY[] = [];
  const rising: GOOGLE_TRENDS_RELATED_QUERY[] = [];

  // rankedLists[0] = top, rankedLists[1] = rising (when present).
  const topList = rankedLists[0]?.rankedKeyword ?? [];
  const risingList = rankedLists[1]?.rankedKeyword ?? [];

  for (const item of topList.slice(0, limit)) {
    if (!item || typeof item.query !== "string") continue;
    top.push({
      query: item.query,
      value: typeof item.value === "number" ? item.value : null,
      formattedValue: item.formattedValue ?? null,
      isBreakout: false,
      growth: null,
      kind: "top",
    });
  }

  for (const item of risingList.slice(0, limit)) {
    if (!item || typeof item.query !== "string") continue;
    const formattedValue = item.formattedValue ?? null;
    const isBreakout = /breakout/i.test(formattedValue ?? "");
    rising.push({
      query: item.query,
      value: typeof item.value === "number" ? item.value : null,
      formattedValue,
      isBreakout,
      growth: isBreakout ? null : parseGrowthPercentage(formattedValue),
      kind: "rising",
    });
  }

  return { top, rising };
}

/** Parses the geo-map widgetdata response into a geographic distribution list. */
export function parseGeoMap(
  body: string,
  limit: number,
): GOOGLE_TRENDS_GEO_ENTRY[] {
  const parsed = parseTrendsApiJson<GOOGLE_TRENDS_RAW_GEO_MAP>(body);
  const geoMapData = parsed.default?.geoMapData ?? [];

  const entries: GOOGLE_TRENDS_GEO_ENTRY[] = [];
  for (const item of geoMapData.slice(0, limit)) {
    if (!item) continue;
    entries.push({
      geo: item.geo ?? "",
      geoName: item.geoName ?? "",
      values: Array.isArray(item.value)
        ? item.value.filter((v: unknown): v is number => typeof v === "number")
        : [],
      formattedValues: Array.isArray(item.formattedValue)
        ? item.formattedValue.filter((v: unknown): v is string => typeof v === "string")
        : [],
    });
  }
  return entries;
}
