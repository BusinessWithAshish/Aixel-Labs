export const INSTAGRAM_BASE_URL = "https://www.instagram.com";

export const IG_APP_ID = "936619743392459";

export const IG_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  priority: "u=1, i",
  "sec-ch-prefers-color-scheme": "dark",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-full-version-list":
    '"Chromium";v="131.0.6778.267", "Not_A Brand";v="24.0.0.0"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-model": '""',
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-ua-platform-version": '"26.2.0"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "x-ig-app-id": IG_APP_ID,
  "x-ig-www-claim": "0",
  "x-requested-with": "XMLHttpRequest",
  referer: INSTAGRAM_BASE_URL,
};

export const INSTAGRAM_QUERY_LIMITS = {
  maxEntities: 100,
  /** Google query word cap (same as legacy browser-worker gsearch). */
  maxQueryWords: 30,
};
export const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const INSTAGRAM_URL_REGEX =
  /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_]+/;
