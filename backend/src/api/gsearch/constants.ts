export const DEFAULT_GSEARCH_MAX_PAGES = 10;
export const DEFAULT_GSEARCH_LANGUAGE = "en";
export const GOOGLE_BASE_URL = "https://www.google.com";
export const GOOGLE_SEARCH_URL = `${GOOGLE_BASE_URL}/search`;

export const GOOGLE_SEARCH_QUERY_LIMITS = {
  maxQueryChars: 1900,
  maxQueryWords: 30,
};

export const GOOGLE_SEARCH_QUERY_PARAMS = {
  /** Query parameter */
  q: "q",
  /** Language parameter */
  hl: "hl",
  /** Country parameter */
  gl: "gl",
  /** Time filter parameter */
  tbs: "tbs",
  /** Filter parameter */
  filter: "filter",
  /** No personal results parameter */
  nfpr: "nfpr",
  /** Personal results parameter */
  pws: "pws",
  /** User data mode parameter */
  udm: "udm",
  /** Near parameter */
  near: "near",
} as const;

export const defaultGsearchQueryParams = new URLSearchParams({
  [GOOGLE_SEARCH_QUERY_PARAMS.filter]: "0",
  [GOOGLE_SEARCH_QUERY_PARAMS.nfpr]: "1",
  [GOOGLE_SEARCH_QUERY_PARAMS.pws]: "0",
  [GOOGLE_SEARCH_QUERY_PARAMS.udm]: "14",
  [GOOGLE_SEARCH_QUERY_PARAMS.hl]: DEFAULT_GSEARCH_LANGUAGE,
});
