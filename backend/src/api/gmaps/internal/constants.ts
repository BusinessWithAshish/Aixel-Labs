// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — SINGLE SOURCE OF TRUTH
//  All magic numbers, URLs, delays, and field paths live here.
//  Nothing in helpers.ts or handler.ts should hardcode values.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_GOOGLE_MAPS_URL } from "../helpers";

export const GMAPS_FIELD_DESCRIPTIONS = {
  base: "When ever there is a query based input given byt he user and not a url directly, dont fill up the urls array, unless user gives the array of url(s) as input",
  country:
    "Full country name, always auto-inferred from any city or region mentioned — never ask the user. Examples: Miami → 'United States', London → 'United Kingdom', Dubai → 'United Arab Emirates', Mumbai → 'India', Toronto → 'Canada', Sydney → 'Australia'. One country per submission.",
  state:
    "State or province, always auto-inferred from any city mentioned — never ask the user. Examples: Miami → 'Florida', Chicago → 'Illinois', Los Angeles → 'California', Mumbai → 'Maharashtra', Toronto → 'Ontario', Sydney → 'New South Wales'. Omit (leave empty) for UAE, Singapore, Hong Kong, Bahrain, Kuwait, Qatar, Oman, Luxembourg, Monaco — these have no state-level division.",
  cities:
    'One or more cities in the same country and state when applicable. Never mix cities from different states or regions. Whenever the user names a city or cities, populate cities from that wording (e.g. Miami → ["Miami"]). Do not drop city names.',
  urls: "Valid Google Maps URLs. When provided, omit query, country, state, and cities.",
  countryCode:
    "Lowercase ISO 3166-1 alpha-2 code derived from country. India in, United States us, United Arab Emirates ae, United Kingdom gb. Set whenever country is known; never ask the user.",
  placeType:
    "Places API Table A leaf type id when the user names a known category (e.g. dentist, plumber, restaurant, cafe). Prefer placeType over free-text query when it matches. Omit for custom niches or when only urls are provided.",
  query:
    "Optional keywords or modifiers only — never include city/location. Use with placeType (e.g. placeType dentist + query emergency) or alone for custom search text when no placeType fits (e.g. emergency plumbers). Fold brainstormed keywords here.",
  enrichment:
    "Optional post-scrape quality filters (minRating, minReviews, maxReviews, requirePhone, requireWebsite, categoryContains). Applied after places are discovered.",
  limit:
    "Maximum number of places to return after enrichment. Defaults to 200.",
} as const;

// ── Geo math constants ────────────────────────────────────────
export const EARTH_RADIUS = 6_371_010; // metres
export const TILE_SIZE = 256; // Google Maps tile px

// ── All scraper config ────────────────────────────────────────
export const GMAPS = {
  // ── URLs ────────────────────────────────────────────────────
  MAPS_SEARCH_URL: DEFAULT_GOOGLE_MAPS_URL,
  MAPS_API_URL: "https://www.google.com/search",
  MAPS_PLACE_URL: "https://www.google.com/maps/place/?q=place_id:",

  // ── Default locale ──────────────────────────────────────────
  DEFAULT_HL: "en", // language code (hl param)

  // ── Pagination ──────────────────────────────────────────────
  RESULTS_PER_PAGE: 20,
  MAX_PAGES: 10,
  DEFAULT_ZOOM: 14,

  // ── Retry / failure thresholds ──────────────────────────────
  MAX_RETRIES: 3,
  MAX_CONSECUTIVE_FAILURES: 2,

  // ── Delays (milliseconds) ───────────────────────────────────
  // Between paginated requests for the same city query
  DELAY_PAGE_MIN: 800,
  DELAY_PAGE_MAX: 1_400,
  // Between two different city queries
  DELAY_CITY_MIN: 2_500,
  DELAY_CITY_MAX: 5_000,
  // Base for exponential retry backoff  → base * attempt
  DELAY_RETRY_BASE: 2_000,

  // ── Viewport (must match pb parameter values) ───────────────
  SCREEN_W: 1024,
  SCREEN_H: 768,

  // ── Fallback coords when Google can't resolve a city ────────
  // Default: Pune, India
  FALLBACK_LAT: 18.5355665,
  FALLBACK_LNG: 73.8308849,

  // ── Protobuf response field paths ───────────────────────────
  // Format: p[N] → scalar index  |  p[N][M] → nested path
  // Update these if the inspector script reports field changes.
  FIELDS: {
    NAME: 11,
    NAME_LOCAL: 101,
    PLACE_ID: 78,
    FULL_ADDRESS: 18,
    ALT_ADDRESS: 39,
    COORDS: 9,
    COORDS_LAT: 2, // within p[9]
    COORDS_LNG: 3, // within p[9]
    PHONE: [178, 0, 0] as const,
    WEBSITE: [7, 0] as const,
    CATEGORIES: 13,
    RATING: [4, 7] as const,
    REVIEW_COUNT: [4, 8] as const,
    REVIEW_TEXT: [4, 3, 1] as const,
  },

  // ── Browser profiles ────────────────────────────────────────
  // Each entry ties a TLS clientIdentifier to a matching UA +
  // Sec-Ch-Ua header so all signals point to the same browser.
  // One profile is picked randomly per handler invocation and
  // kept consistent for the entire request/response cycle.
  BROWSER_PROFILES: [
    {
      clientIdentifier: "chrome_131",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      secChUa:
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      platform: '"Windows"',
    },
    {
      clientIdentifier: "chrome_131",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      secChUa:
        '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      platform: '"macOS"',
    },
    {
      clientIdentifier: "chrome_124",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      secChUa:
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      platform: '"Windows"',
    },
    {
      clientIdentifier: "chrome_124",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      secChUa:
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      platform: '"macOS"',
    },
    {
      clientIdentifier: "chrome_124",
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      secChUa:
        '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      platform: '"Linux"',
    },
  ],

  // ── TLS session options ─────────────────────────────────────
  TLS_TIMEOUT_SECS: 30,
  TLS_RANDOM_EXTENSIONS: true, // randomise extension order per session
  TLS_FOLLOW_REDIRECTS: true,
} as const;

// ── Derived type helpers ──────────────────────────────────────
export type BrowserProfile = (typeof GMAPS.BROWSER_PROFILES)[number];
