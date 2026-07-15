import type { GMAPS_INTERNAL_RESPONSE } from "../internal/types";
import type { GMAPS_ENRICHMENT } from "./schema";
import { GMAPS_ENRICHMENT_DEFAULTS } from "./constants";

type GmapsPlaceFields = Pick<
  GMAPS_INTERNAL_RESPONSE,
  "phone" | "website" | "rating" | "reviewCount" | "categories"
>;

const nonEmpty = (value: string | null | undefined): boolean =>
  typeof value === "string" && value.trim().length > 0;

const toNum = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * True when any enrichment rule would exclude places
 * (i.e. filters are not at their inactive defaults).
 */
export const isEnrichmentActive = (f: GMAPS_ENRICHMENT): boolean =>
  f.minRating > 0 ||
  f.minReviews > 0 ||
  f.maxReviews !== null ||
  f.requirePhone ||
  f.requireWebsite ||
  f.categoryContains.length > 0;

/** Inclusive bounds; `max === null` means no upper bound. Missing values fail when a bound is active. */
const inRange = (
  value: number | null,
  min: number,
  max: number | null,
): boolean => {
  if (min <= 0 && max === null) return true;
  if (value === null) return false;
  if (min > 0 && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
};

/**
 * Normalize unknown lead payloads (legacy browser-worker + current API)
 * into the canonical place fields the matcher expects.
 */
export const toGmapsPlace = (data: unknown): GmapsPlaceFields => {
  if (typeof data !== "object" || data === null) {
    return {
      phone: null,
      website: null,
      rating: null,
      reviewCount: null,
      categories: null,
    };
  }

  const d = data as Record<string, unknown>;
  const categories = Array.isArray(d.categories)
    ? d.categories.filter((c): c is string => typeof c === "string")
    : null;

  return {
    phone: nonEmpty(d.phone as string)
      ? (d.phone as string)
      : nonEmpty(d.phoneNumber as string)
        ? (d.phoneNumber as string)
        : null,
    website: nonEmpty(d.website as string) ? (d.website as string) : null,
    rating: toNum(d.rating ?? d.overAllRating),
    reviewCount: toNum(d.reviewCount ?? d.numberOfReviews),
    categories: categories && categories.length > 0 ? categories : null,
  };
};

export const matchGmapsPlace = (
  place: GmapsPlaceFields,
  enrichment: GMAPS_ENRICHMENT,
): boolean => {
  if (enrichment.requirePhone && !nonEmpty(place.phone)) return false;
  if (enrichment.requireWebsite && !nonEmpty(place.website)) return false;

  if (enrichment.categoryContains.length > 0) {
    const needle = enrichment.categoryContains.toLowerCase();
    const cats = place.categories ?? [];
    if (!cats.some((c) => c.toLowerCase().includes(needle))) return false;
  }

  if (enrichment.minRating > 0) {
    if (place.rating === null || place.rating < enrichment.minRating) return false;
  }

  if (!inRange(place.reviewCount, enrichment.minReviews, enrichment.maxReviews)) {
    return false;
  }

  return true;
};

export const filterGmapsPlaces = <T extends GmapsPlaceFields>(
  places: T[],
  enrichment: GMAPS_ENRICHMENT = GMAPS_ENRICHMENT_DEFAULTS,
): T[] => {
  if (!isEnrichmentActive(enrichment)) return places;
  return places.filter((p) => matchGmapsPlace(p, enrichment));
};
