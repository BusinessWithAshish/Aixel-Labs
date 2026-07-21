import type { z } from "zod";
import type {
  GOOGLE_TRENDS_PROPERTY,
  GOOGLE_TRENDS_TIMEFRAME,
} from "../constants";
import type { GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA } from "./schemas";

export type GOOGLE_TRENDS_INTEREST_REQUEST = z.infer<
  typeof GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA
>;

export type GOOGLE_TRENDS_TIMEFRAME_VALUE =
  (typeof GOOGLE_TRENDS_TIMEFRAME)[keyof typeof GOOGLE_TRENDS_TIMEFRAME];

export type GOOGLE_TRENDS_PROPERTY_VALUE =
  (typeof GOOGLE_TRENDS_PROPERTY)[keyof typeof GOOGLE_TRENDS_PROPERTY];

/** A single comparison item — keyword + geo + timeframe. */
export type GOOGLE_TRENDS_COMPARISON_ITEM = {
  keyword: string;
  geo: string;
  time: GOOGLE_TRENDS_TIMEFRAME_VALUE;
};

// ─── Parsed response shapes ────────────────────────────────────────────────────

/** A single interest-over-time data point. */
export type GOOGLE_TRENDS_INTEREST_POINT = {
  /** Unix timestamp (seconds) of the bucket start, from the raw `time` field. */
  time: number;
  /** Human-readable date label as Google formatted it (e.g. "Jan 6 – 12, 2024"). */
  formattedTime: string;
  /**
   * Interest values (0–100), one per compared query. For a single-query
   * request this is a single-element array. Google normalises the scale so
   * the highest point across all compared queries is 100.
   */
  values: number[];
  /** Google's formatted value strings, parallel to `values` (e.g. "100", "78"). */
  formattedValues: string[];
};

/** A single related query (top or rising). */
export type GOOGLE_TRENDS_RELATED_QUERY = {
  query: string;
  /**
   * Scaled value. For top queries this is 0–100. For rising queries this is
   * the growth percentage numerator when available.
   */
  value: number | null;
  /** Google's formatted display string (e.g. "100", "+5,000%"). */
  formattedValue: string | null;
  /**
   * `true` when Google flagged this rising query as "Breakout" (growth exceeded
   * the displayable threshold). When true, `value` is null and `growth` is null.
   */
  isBreakout: boolean;
  /**
   * Parsed growth percentage for rising queries (e.g. 5000 for "+5,000%").
   * `null` for top queries, breakout queries, or when unparseable.
   */
  growth: number | null;
  /** Whether this entry came from the "top" or "rising" ranked list. */
  kind: "top" | "rising";
};

/** A single geographic distribution entry. */
export type GOOGLE_TRENDS_GEO_ENTRY = {
  /** ISO 3166-1 alpha-2 country code, or ISO 3166-2 region code (e.g. "US-CA"). */
  geo: string;
  /** Human-readable region/country name (e.g. "California", "United States"). */
  geoName: string;
  /**
   * Interest values (0–100), one per compared query. For a single-query
   * request this is a single-element array.
   */
  values: number[];
  /** Google's formatted value strings, parallel to `values`. */
  formattedValues: string[];
};

export type GOOGLE_TRENDS_INTEREST_RESPONSE = {
  /** Echoed comparison items (keyword + geo + timeframe). */
  comparisonItems: GOOGLE_TRENDS_COMPARISON_ITEM[];
  /** Echoed category ID (0 = all categories). */
  category: number;
  /** Echoed Google property (web, youtube, news, …). */
  property: GOOGLE_TRENDS_PROPERTY_VALUE;
  /** Echoed BCP-47 language code. */
  hl: string;
  /** Echoed timezone offset (minutes). */
  tz: number;
  /** Interest-over-time series. */
  interestOverTime: GOOGLE_TRENDS_INTEREST_POINT[];
  /** Top related queries (most searched terms related to the input). */
  topRelatedQueries: GOOGLE_TRENDS_RELATED_QUERY[];
  /** Rising related queries (fastest-growing terms related to the input). */
  risingRelatedQueries: GOOGLE_TRENDS_RELATED_QUERY[];
  /** Geographic distribution of interest. */
  geoDistribution: GOOGLE_TRENDS_GEO_ENTRY[];
  /** Verbatim raw explore response JSON (widget tokens + requests). */
  rawExplore: string;
};

// ─── Raw `explore` response shape (internal — not exported) ──────────────────────

/** A single widget descriptor returned by `/trends/api/explore`. */
export type GOOGLE_TRENDS_RAW_WIDGET = {
  id: string;
  token: string;
  /** The `request` object embedded for this widget — opaque, passed through. */
  request: Record<string, unknown>;
  /** Other metadata fields Google includes (title, template, etc.) — preserved verbatim. */
  [key: string]: unknown;
};

export type GOOGLE_TRENDS_RAW_EXPLORE_RESPONSE = {
  widgets: GOOGLE_TRENDS_RAW_WIDGET[];
};

// ─── Raw widgetdata shapes (internal — not exported) ───────────────────────────

export type GOOGLE_TRENDS_RAW_TIMESERIES = {
  default?: {
    timelineData?: Array<{
      time: string;
      formattedTime?: string;
      value?: number[];
      formattedValue?: string[];
      hasData?: boolean[];
    }>;
  };
};

export type GOOGLE_TRENDS_RAW_RELATED_SEARCHES = {
  default?: {
    rankedList?: Array<{
      rankedKeyword?: Array<{
        query?: string;
        value?: number;
        formattedValue?: string;
        hasData?: boolean;
        link?: string;
      }>;
    }>;
  };
};

export type GOOGLE_TRENDS_RAW_GEO_MAP = {
  default?: {
    geoMapData?: Array<{
      geo?: string;
      geoName?: string;
      value?: number[];
      formattedValue?: string[];
      hasData?: boolean[];
    }>;
  };
};
