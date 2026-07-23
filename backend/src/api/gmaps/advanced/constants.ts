export const GMAPS_ADVANCED_ROUTES = {
  ADVANCED: "/advanced",
} as const;

export const GMAPS_ADVANCED_LIMITS = {
  maxUrls: 25,
} as const;

export const GMAPS_ADVANCED_DEFAULTS = {
  RICHNESS: "rich" as const,
} as const;

export const GMAPS_ADVANCED_ERROR_MESSAGES = {
  INVALID_PARAMS: "Provide at least one Google Maps place URL.",
  INVALID_URL: "Each entry must be a valid Google Maps place URL.",
  NO_RESULTS: "Could not resolve place details for any of the provided URLs.",
  GENERIC: "Failed to fetch Google Maps advanced place details.",
} as const;
