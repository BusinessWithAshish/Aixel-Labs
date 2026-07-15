/** Upper bound for `limit` on Google Maps scraper request payloads. */
export const GMAPS_REQUEST_LIMIT_MAX = 500;

/** Default max results returned after enrichment. */
export const GMAPS_REQUEST_LIMIT_DEFAULT = 200;

/**
 * Inactive / empty enrichment values.
 * After Zod parse, every field is always present — use these sentinels
 * instead of optional/undefined checks in matchers and UI.
 */
export const GMAPS_ENRICHMENT_DEFAULTS: {
  minRating: number;
  minReviews: number;
  maxReviews: number | null;
  requirePhone: boolean;
  requireWebsite: boolean;
  categoryContains: string;
} = {
  minRating: 0,
  minReviews: 0,
  maxReviews: null,
  requirePhone: false,
  requireWebsite: false,
  categoryContains: "",
};

/** Shared min-rating options for scrape form + leads sheet. */
export const GMAPS_MIN_RATING_OPTIONS = [
  { value: 0, label: "Any" },
  { value: 3, label: "3.0+" },
  { value: 3.5, label: "3.5+" },
  { value: 4, label: "4.0+" },
  { value: 4.5, label: "4.5+" },
  { value: 5, label: "5.0" },
] as const;

export const GMAPS_ENRICHMENT_FIELD_DESCRIPTIONS = {
  enrichment:
    "Optional post-scrape quality filters. Applied after places are discovered; does not change the Maps search query.",
  minRating:
    "Minimum average star rating (0–5, steps of 0.5). 0 means no minimum. Places without a rating fail when minRating > 0.",
  minReviews:
    "Minimum review count. 0 means no minimum. Places without a review count fail when minReviews > 0.",
  maxReviews:
    "Maximum review count, or null for no upper bound. Places without a review count fail when maxReviews is set.",
  requirePhone: "When true, only places with a non-empty phone number are returned.",
  requireWebsite: "When true, only places with a non-empty website are returned.",
  categoryContains:
    "Case-insensitive substring that must appear in at least one category label. Empty string means no category filter.",
  limit: `Maximum number of places to return after enrichment (1–${GMAPS_REQUEST_LIMIT_MAX}). Defaults to ${GMAPS_REQUEST_LIMIT_DEFAULT}.`,
} as const;
