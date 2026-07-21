// ─── JSONP wrapper ────────────────────────────────────────────────────────────

/**
 * JSONP envelope used by the YouTube suggestions endpoint when
 * `client=youtube`. The payload is the array literal inside the call.
 */
export const YOUTUBE_SUGGEST_JSONP_PREFIX = "window.google.ac.h(";
export const YOUTUBE_SUGGEST_JSONP_SUFFIX = ")";

// ─── Suggest endpoint query-param names ───────────────────────────────────────

/**
 * Query-parameter names for the `suggestqueries-clients6.youtube.com/complete/search`
 * endpoint. Centralised so the URL builder and any future callers share a single
 * source of truth.
 */
export const YOUTUBE_SUGGEST_QUERY_PARAMS = {
  DATASET: "ds",
  LANGUAGE: "hl",
  GEO: "gl",
  CLIENT: "client",
  CLIENT_GS_RI: "gs_ri",
  QUERY: "q",
  CURSOR_POSITION: "cp",
} as const;

// ─── Suggestion entry "type" codes ────────────────────────────────────────────

/**
 * Numeric suggestion-type codes observed in the wild. YouTube does not
 * document these; they appear to be the same Google Suggest codes used by
 * google.com autocomplete. Only the values we have actually observed are
 * enumerated — unknown codes are preserved verbatim in `type`.
 */
export const YOUTUBE_SUGGEST_TYPE = {
  /** Default / unknown suggestion. */
  QUERY: 0,
} as const;
