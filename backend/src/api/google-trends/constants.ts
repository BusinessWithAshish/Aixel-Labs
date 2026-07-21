// ─── Base URL & defaults ──────────────────────────────────────────────────────

export const GOOGLE_TRENDS_BASE_URL = "https://trends.google.com";

/** Trending "Now" page path — the SSR HTML embeds all trending data in `AF_initDataCallback` blocks. */
export const GOOGLE_TRENDS_TRENDING_PATH = "/trending";

/** Default ISO 3166-1 alpha-2 country code for the `geo` query param. */
export const GOOGLE_TRENDS_DEFAULT_GEO = "US";

/** Default BCP-47 language code for the `hl` query param. */
export const GOOGLE_TRENDS_DEFAULT_HL = "en";

// ─── Time windows (`hours` query param) ──────────────────────────────────────

/**
 * Supported `hours` values for the trending page. These are the only windows
 * the Google Trends UI exposes (Past 4 hours / 24 hours / 48 hours / 7 days).
 */
export const GOOGLE_TRENDS_HOURS = {
  PAST_4_HOURS: 4,
  PAST_24_HOURS: 24,
  PAST_48_HOURS: 48,
  PAST_7_DAYS: 168,
} as const;

export const GOOGLE_TRENDS_HOURS_VALUES = [
  GOOGLE_TRENDS_HOURS.PAST_4_HOURS,
  GOOGLE_TRENDS_HOURS.PAST_24_HOURS,
  GOOGLE_TRENDS_HOURS.PAST_48_HOURS,
  GOOGLE_TRENDS_HOURS.PAST_7_DAYS,
] as const;

// ─── Category IDs (`category` query param / field [10] codes) ──────────────────

/**
 * Google Trends trending category IDs, harvested from the live category
 * dropdown's `data-value` attributes. The `category` URL param is applied
 * client-side only — the SSR HTML returns every entry regardless of category —
 * so we post-filter on each entry's `categories` array (field [10]).
 *
 * `0` is "All categories" (no filtering).
 */
export const GOOGLE_TRENDS_CATEGORY = {
  ALL: 0,
  AUTOS_AND_VEHICLES: 1,
  BEAUTY_AND_FASHION: 2,
  BUSINESS_AND_FINANCE: 3,
  CLIMATE: 20,
  ENTERTAINMENT: 4,
  FOOD_AND_DRINK: 5,
  GAMES: 6,
  HEALTH: 7,
  HOBBIES_AND_LEISURE: 8,
  JOBS_AND_EDUCATION: 9,
  LAW_AND_GOVERNMENT: 10,
  OTHER: 11,
  PETS_AND_ANIMALS: 13,
  POLITICS: 14,
  SCIENCE: 15,
  SHOPPING: 16,
  SPORTS: 17,
  TECHNOLOGY: 18,
  TRAVEL_AND_TRANSPORTATION: 19,
} as const;

export const GOOGLE_TRENDS_CATEGORY_VALUES = Object.values(
  GOOGLE_TRENDS_CATEGORY,
).sort((a, b) => a - b);

/** Human-readable names for the category IDs above. */
export const GOOGLE_TRENDS_CATEGORY_NAMES: Record<number, string> = {
  [GOOGLE_TRENDS_CATEGORY.ALL]: "All categories",
  [GOOGLE_TRENDS_CATEGORY.AUTOS_AND_VEHICLES]: "Autos and Vehicles",
  [GOOGLE_TRENDS_CATEGORY.BEAUTY_AND_FASHION]: "Beauty and Fashion",
  [GOOGLE_TRENDS_CATEGORY.BUSINESS_AND_FINANCE]: "Business and Finance",
  [GOOGLE_TRENDS_CATEGORY.CLIMATE]: "Climate",
  [GOOGLE_TRENDS_CATEGORY.ENTERTAINMENT]: "Entertainment",
  [GOOGLE_TRENDS_CATEGORY.FOOD_AND_DRINK]: "Food and Drink",
  [GOOGLE_TRENDS_CATEGORY.GAMES]: "Games",
  [GOOGLE_TRENDS_CATEGORY.HEALTH]: "Health",
  [GOOGLE_TRENDS_CATEGORY.HOBBIES_AND_LEISURE]: "Hobbies and Leisure",
  [GOOGLE_TRENDS_CATEGORY.JOBS_AND_EDUCATION]: "Jobs and Education",
  [GOOGLE_TRENDS_CATEGORY.LAW_AND_GOVERNMENT]: "Law and Government",
  [GOOGLE_TRENDS_CATEGORY.OTHER]: "Other",
  [GOOGLE_TRENDS_CATEGORY.PETS_AND_ANIMALS]: "Pets and Animals",
  [GOOGLE_TRENDS_CATEGORY.POLITICS]: "Politics",
  [GOOGLE_TRENDS_CATEGORY.SCIENCE]: "Science",
  [GOOGLE_TRENDS_CATEGORY.SHOPPING]: "Shopping",
  [GOOGLE_TRENDS_CATEGORY.SPORTS]: "Sports",
  [GOOGLE_TRENDS_CATEGORY.TECHNOLOGY]: "Technology",
  [GOOGLE_TRENDS_CATEGORY.TRAVEL_AND_TRANSPORTATION]:
    "Travel and Transportation",
};

// ─── Sort & trend-status (client-side post-processing) ────────────────────────

export const GOOGLE_TRENDS_SORT = {
  RELEVANCE: "relevance",
  VOLUME: "volume",
  STARTED: "started",
} as const;

export const GOOGLE_TRENDS_SORT_VALUES = [
  GOOGLE_TRENDS_SORT.RELEVANCE,
  GOOGLE_TRENDS_SORT.VOLUME,
  GOOGLE_TRENDS_SORT.STARTED,
] as const;

export const GOOGLE_TRENDS_STATUS = {
  ALL: "all",
  TRENDING: "trending",
  STARTED: "started",
} as const;

export const GOOGLE_TRENDS_STATUS_VALUES = [
  GOOGLE_TRENDS_STATUS.ALL,
  GOOGLE_TRENDS_STATUS.TRENDING,
  GOOGLE_TRENDS_STATUS.STARTED,
] as const;

// ─── SSR data block keys ──────────────────────────────────────────────────────

/**
 * `AF_initDataCallback` key that carries the trending-now entry list.
 * The data is a `[null, entries[]]` array where each entry is the tuple
 * described in `types.ts` → `GOOGLE_TRENDS_RAW_ENTRY`.
 */
export const GOOGLE_TRENDS_DS0_KEY = "ds:0";

/**
 * `AF_initDataCallback` key that carries the resolved geo display name, e.g.
 * `["United States"]`. Used to echo a human-readable `geoName` back to callers.
 */
export const GOOGLE_TRENDS_DS1_KEY = "ds:1";

/**
 * Markers used to locate an `AF_initDataCallback({key:'…', data:…})` block
 * inside the SSR HTML. The key needle is built as `${KEY_PREFIX}${key}${KEY_SUFFIX}`.
 */
export const GOOGLE_TRENDS_AF_INIT = {
  KEY_PREFIX: "key: '",
  KEY_SUFFIX: "'",
  DATA_MARKER: "data:",
} as const;

// ─── Trending-page query-param names ──────────────────────────────────────────

/**
 * Query-parameter names for `trends.google.com/trending`. Centralised so the
 * URL builder and any future callers share a single source of truth.
 */
export const GOOGLE_TRENDS_QUERY_PARAMS = {
  GEO: "geo",
  LANGUAGE: "hl",
  HOURS: "hours",
} as const;

// ─── HTTP headers for the SSR page fetch ──────────────────────────────────────

export const GOOGLE_TRENDS_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36";

export const GOOGLE_TRENDS_ACCEPT_HEADER =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

/** Accept header for interest/explore API JSON responses. */
export const GOOGLE_TRENDS_INTEREST_ACCEPT_HEADER =
  "application/json,text/plain,*/*";

/** Referer sent with interest/explore API requests. */
export const GOOGLE_TRENDS_INTEREST_REFERER =
  "https://trends.google.com/trends/explore";

// ─── Limits ───────────────────────────────────────────────────────────────────

/** Maximum number of trending entries to return. The page can return 2000+ for 7-day windows. */
export const GOOGLE_TRENDS_MAX_LIMIT = 5000;
export const GOOGLE_TRENDS_DEFAULT_LIMIT = 500;

// ─── Route paths & handler labels ─────────────────────────────────────────────

export const GOOGLE_TRENDS_API_ROUTES = {
  TRENDING: "/trending",
  INTEREST: "/interest",
  INTELLIGENCE_INTEREST: "/intelligence/interest",
  INTELLIGENCE_COMPARE: "/intelligence/compare",
} as const;

export const GOOGLE_TRENDS_HANDLER_LABELS = {
  TRENDING: "GOOGLE_TRENDS/TRENDING",
  INTEREST: "GOOGLE_TRENDS/INTEREST",
  INTELLIGENCE_INTEREST: "GOOGLE_TRENDS/INTELLIGENCE/INTEREST",
  INTELLIGENCE_COMPARE: "GOOGLE_TRENDS/INTELLIGENCE/COMPARE",
} as const;

// ─── Interest-over-time API (explore + widgetdata) ─────────────────────────────

/**
 * `/trends/api/explore` returns the widget tokens needed to call the
 * widgetdata endpoints. The response is JSON prefixed with `)]}'\n` to
 * prevent JSON hijacking — we strip it before parsing.
 */
export const GOOGLE_TRENDS_EXPLORE_PATH = "/trends/api/explore";
export const GOOGLE_TRENDS_EXPLORE_RESPONSE_PREFIX = ")]}'";

/**
 * Widgetdata base path. Each widget type appends its own suffix:
 *   TIMESERIES       → /trends/api/widgetdata/multiline/timeseries/json
 *   RELATED_QUERIES  → /trends/api/widgetdata/relatedsearches/json
 *   GEO_MAP          → /trends/api/widgetdata/relatedsearches/geo/json
 */
export const GOOGLE_TRENDS_WIDGETDATA_BASE_PATH =
  "/trends/api/widgetdata";

export const GOOGLE_TRENDS_WIDGET_ID = {
  TIMESERIES: "TIMESERIES",
  RELATED_QUERIES: "RELATED_QUERIES",
  RELATED_TOPICS: "RELATED_TOPICS",
  GEO_MAP: "GEO_MAP",
} as const;

/**
 * `gprop` (Google property) values for the explore `req.comparisonItems[].gprop`
 * field. Empty string = Google web search; `"youtube"` = YouTube search.
 */
export const GOOGLE_TRENDS_PROPERTY = {
  WEB: "",
  YOUTUBE: "youtube",
  NEWS: "news",
  IMAGES: "images",
  SHOPPING: "froogle",
} as const;

export const GOOGLE_TRENDS_PROPERTY_VALUES = [
  GOOGLE_TRENDS_PROPERTY.WEB,
  GOOGLE_TRENDS_PROPERTY.YOUTUBE,
  GOOGLE_TRENDS_PROPERTY.NEWS,
  GOOGLE_TRENDS_PROPERTY.IMAGES,
  GOOGLE_TRENDS_PROPERTY.SHOPPING,
] as const;

/**
 * Timeframe presets mapped to the Google Trends `time` string format used in
 * the explore `req.comparisonItems[].time` field.
 *
 * - `now 7-d`  → last 7 days (hourly granularity)
 * - `today 1-m` → last 30 days (daily)
 * - `today 3-m` → last 90 days (daily)
 * - `today 12-m` → last 12 months (weekly)
 * - `today 5-y` → last 5 years (monthly)
 */
export const GOOGLE_TRENDS_TIMEFRAME = {
  LAST_7_DAYS: "now 7-d",
  LAST_30_DAYS: "today 1-m",
  LAST_90_DAYS: "today 3-m",
  LAST_12_MONTHS: "today 12-m",
  LAST_5_YEARS: "today 5-y",
} as const;

export const GOOGLE_TRENDS_TIMEFRAME_VALUES = [
  GOOGLE_TRENDS_TIMEFRAME.LAST_7_DAYS,
  GOOGLE_TRENDS_TIMEFRAME.LAST_30_DAYS,
  GOOGLE_TRENDS_TIMEFRAME.LAST_90_DAYS,
  GOOGLE_TRENDS_TIMEFRAME.LAST_12_MONTHS,
  GOOGLE_TRENDS_TIMEFRAME.LAST_5_YEARS,
] as const;

export const GOOGLE_TRENDS_TIMEFRAME_LABELS: Record<string, string> = {
  [GOOGLE_TRENDS_TIMEFRAME.LAST_7_DAYS]: "last 7 days",
  [GOOGLE_TRENDS_TIMEFRAME.LAST_30_DAYS]: "last 30 days",
  [GOOGLE_TRENDS_TIMEFRAME.LAST_90_DAYS]: "last 90 days",
  [GOOGLE_TRENDS_TIMEFRAME.LAST_12_MONTHS]: "last 12 months",
  [GOOGLE_TRENDS_TIMEFRAME.LAST_5_YEARS]: "last 5 years",
};

/** Timezone offset (minutes) sent as the `tz` query param. -300 = America/New_York. */
export const GOOGLE_TRENDS_DEFAULT_TZ = -300;

/** Maximum number of queries Google Trends can compare in a single explore call. */
export const GOOGLE_TRENDS_MAX_COMPARE_QUERIES = 5;
export const GOOGLE_TRENDS_MIN_COMPARE_QUERIES = 2;
