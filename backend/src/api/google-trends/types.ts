import type { z } from "zod";
import type {
  GOOGLE_TRENDS_CATEGORY,
  GOOGLE_TRENDS_HOURS,
  GOOGLE_TRENDS_SORT,
  GOOGLE_TRENDS_STATUS,
} from "./constants";
import type { GOOGLE_TRENDS_REQUEST_SCHEMA } from "./schemas";

export type GOOGLE_TRENDS_REQUEST = z.infer<typeof GOOGLE_TRENDS_REQUEST_SCHEMA>;

export type GOOGLE_TRENDS_HOURS_VALUE =
  (typeof GOOGLE_TRENDS_HOURS)[keyof typeof GOOGLE_TRENDS_HOURS];

export type GOOGLE_TRENDS_CATEGORY_ID =
  (typeof GOOGLE_TRENDS_CATEGORY)[keyof typeof GOOGLE_TRENDS_CATEGORY];

export type GOOGLE_TRENDS_SORT_VALUE =
  (typeof GOOGLE_TRENDS_SORT)[keyof typeof GOOGLE_TRENDS_SORT];

export type GOOGLE_TRENDS_STATUS_VALUE =
  (typeof GOOGLE_TRENDS_STATUS)[keyof typeof GOOGLE_TRENDS_STATUS];

// ─── Parsed entry ─────────────────────────────────────────────────────────────

/** A single trending-now entry, mapped from the raw `ds:0` tuple. */
export type GOOGLE_TRENDS_TREND = {
  /** Trend title / search keyword. */
  title: string;
  /** ISO 3166-1 alpha-2 country code for the trend (echoes `geo`). */
  geo: string;
  /**
   * Unix timestamp (seconds) when the trend started trending, from field [3][0].
   * `null` only if the raw entry omitted it (has not been observed in the wild).
   */
  startedAt: number | null;
  /**
   * Unix timestamp (seconds) when the trend stopped trending, from field [4][0].
   * `null` means the trend is still active ("Trending" status).
   */
  endedAt: number | null;
  /**
   * Raw scaled search-volume count from field [6] (e.g. 500000, 200000, 100).
   * Google does not document the exact scale; treat as a relative signal.
   */
  volume: number | null;
  /**
   * Scaled trend score from field [8] (e.g. 1000 = hottest, 100/200 = lower).
   * Opaque ranking signal preserved verbatim.
   */
  score: number | null;
  /** Related queries users searched alongside the trend, from field [9]. */
  relatedQueries: string[];
  /**
   * Category IDs assigned to the trend, from field [10].
   * Cross-reference with `GOOGLE_TRENDS_CATEGORY_NAMES` for human-readable labels.
   */
  categories: number[];
  /**
   * News articles Google associated with the trend, from field [11].
   * Each article is `[id, language, geo]` — `id` is an opaque Google article ID.
   */
  articles: GOOGLE_TRENDS_ARTICLE[];
};

export type GOOGLE_TRENDS_ARTICLE = {
  /** Opaque Google article identifier (numeric string). */
  id: string;
  /** Article language code (e.g. "en"). */
  language: string;
  /** Article geo code (e.g. "US"). */
  geo: string;
};

export type GOOGLE_TRENDS_RESPONSE = {
  /** Echoed `geo` request field. */
  geo: string;
  /** Human-readable geo name harvested from the `ds:1` SSR block (e.g. "United States"). */
  geoName: string | null;
  /** Echoed `hl` request field. */
  hl: string;
  /** Echoed `hours` request field. */
  hours: number;
  /** Echoed `category` request field (0 = all categories). */
  category: number;
  /** Echoed `sort` request field. */
  sort: string;
  /** Echoed `status` request field. */
  status: string;
  /** Parsed, filtered, and sorted trending entries. */
  trends: GOOGLE_TRENDS_TREND[];
  /** Number of trends returned (after filtering/sorting/limiting). */
  totalResults: number;
  /**
   * Total number of trends parsed from the page before category/status filtering.
   * Useful to see how much the filters trimmed the result set.
   */
  totalParsed: number;
  /** The raw `ds:0` JSON string (the verbatim array Google embedded in the HTML). */
  raw: string;
};

// ─── Raw `ds:0` payload shape (internal — not exported) ────────────────────────

/**
 * Raw shape of a single trending entry inside the `ds:0` `AF_initDataCallback`
 * data array. The full payload is `[null, entries[]]`.
 *
 * Tuple indices:
 *  [0]  title            string
 *  [1]  null             (unused)
 *  [2]  geo              string  (e.g. "US")
 *  [3]  startedAt        [number]  (Unix seconds, single-element array)
 *  [4]  endedAt          [number] | null  (Unix seconds, or null when still trending)
 *  [5]  null             (unused)
 *  [6]  volume           number  (scaled search count)
 *  [7]  null             (unused)
 *  [8]  score            number  (opaque scaled score, e.g. 1000)
 *  [9]  relatedQueries   string[]
 * [10]  categories       number[]  (category IDs — see GOOGLE_TRENDS_CATEGORY)
 * [11]  articles         [[id, language, geo], ...]
 * [12]  title            string  (repeated)
 */
export type GOOGLE_TRENDS_RAW_ENTRY = [
  string, // [0] title
  null, // [1]
  string, // [2] geo
  [number] | null, // [3] startedAt
  [number] | null, // [4] endedAt
  null, // [5]
  number | null, // [6] volume
  null, // [7]
  number | null, // [8] score
  string[], // [9] relatedQueries
  number[], // [10] categories
  Array<[number | string, string, string]>, // [11] articles
  string, // [12] title
];

export type GOOGLE_TRENDS_RAW_DS0 = [null, GOOGLE_TRENDS_RAW_ENTRY[]];

/** Raw shape of the `ds:1` block: a single-element array with the geo display name. */
export type GOOGLE_TRENDS_RAW_DS1 = [string];
