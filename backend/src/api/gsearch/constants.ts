export const DEFAULT_GSEARCH_MAX_PAGES = 10;
export const DEFAULT_GSEARCH_LANGUAGE = "en";
export const GOOGLE_BASE_URL = "https://www.google.com";
export const GOOGLE_SEARCH_URL = `${GOOGLE_BASE_URL}/search`;

export const GOOGLE_SEARCH_QUERY_LIMITS = {
  maxQueryChars: 1900,
  maxQueryWords: 30,
};

export const GOOGLE_SEARCH_QUERY_PARAMS = {
  q: "q",
  hl: "hl",
  gl: "gl",
  tbs: "tbs",
};

export const HEADERS = {
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
  "sec-ch-ua": '"Chromium";v="145", "Not:A-Brand";v="99"',
  "sec-ch-ua-arch": '"arm"',
  "sec-ch-ua-bitness": '"64"',
  "sec-ch-ua-full-version": '"145.0.7632.117"',
  "sec-ch-ua-full-version-list":
    '"Chromium";v="145.0.7632.117", "Not:A-Brand";v="99.0.0.0"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-model": '""',
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-ua-platform-version": '"26.2.0"',
  "sec-ch-ua-wow64": "?0",
  "sec-ch-prefers-color-scheme": "light",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "cache-control": "max-age=0",
  connection: "keep-alive",
};
