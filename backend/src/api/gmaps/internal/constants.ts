// ─────────────────────────────────────────────────────────────
//  GMAPS SCRAPER — SINGLE SOURCE OF TRUTH
//  All magic numbers, URLs, delays, and field paths live here.
//  Nothing in helpers.ts or handler.ts should hardcode values.
// ─────────────────────────────────────────────────────────────

import { DEFAULT_GOOGLE_MAPS_URL } from "../helpers";

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
