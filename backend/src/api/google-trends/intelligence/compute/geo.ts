import {
  GOOGLE_TRENDS_GEO_CONCENTRATION_THRESHOLD,
  GOOGLE_TRENDS_GEO_CONCENTRATION_TOP_N,
} from "../constants";
import type { GOOGLE_TRENDS_GEO_ENTRY } from "../../interest/types";
import type { GOOGLE_TRENDS_GEOGRAPHIC_CONCENTRATION } from "../types";

/**
 * Computes geographic concentration from the geo distribution. When the top
 * 1–2 regions account for more than `GOOGLE_TRENDS_GEO_CONCENTRATION_THRESHOLD`
 * of total interest, the topic is flagged as geographically concentrated.
 */
export function computeGeographicConcentration(
  geoDistribution: GOOGLE_TRENDS_GEO_ENTRY[],
  queryIndex = 0,
): GOOGLE_TRENDS_GEOGRAPHIC_CONCENTRATION | null {
  if (geoDistribution.length === 0) return null;

  const scored = geoDistribution
    .map((entry) => ({
      geoName: entry.geoName || entry.geo,
      value: entry.values[queryIndex] ?? 0,
    }))
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);

  if (scored.length === 0) return null;

  const total = scored.reduce((sum, e) => sum + e.value, 0);
  if (total <= 0) return null;

  const top = scored.slice(0, GOOGLE_TRENDS_GEO_CONCENTRATION_TOP_N);
  const topSum = top.reduce((sum, e) => sum + e.value, 0);
  const topRegionsShare = topSum / total;
  const isConcentrated = topRegionsShare > GOOGLE_TRENDS_GEO_CONCENTRATION_THRESHOLD;

  return {
    isConcentrated,
    topRegions: top.map((e) => e.geoName),
    topRegionsShare: Math.round(topRegionsShare * 1000) / 1000,
  };
}
