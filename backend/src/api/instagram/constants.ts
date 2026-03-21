export const INSTAGRAM_BASE_URL = "https://www.instagram.com";

export const IG_APP_ID = "936619743392459";
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY_MS = 1_000;

export const IG_HEADERS: Record<string, string> = {
  accept: "*/*",
  "accept-language": "en-US,en;q=0.9",
  "accept-encoding": "gzip, deflate, br, zstd",
  priority: "u=1, i",
  "sec-ch-prefers-color-scheme": "dark",
  "sec-ch-ua": '"Chromium";v="141", "Not?A_Brand";v="8"',
  "sec-ch-ua-full-version-list":
    '"Chromium";v="141.0.7390.122", "Not?A_Brand";v="8.0.0.0"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-model": '""',
  "sec-ch-ua-platform": '"macOS"',
  "sec-ch-ua-platform-version": '"26.2.0"',
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "x-ig-app-id": IG_APP_ID,
  "x-ig-www-claim": "0",
  "x-requested-with": "XMLHttpRequest",
  referer: INSTAGRAM_BASE_URL,
};

export const INSTAGRAM_QUERY_LIMITS = {
  maxEntities: 100,
};
export const INSTAGRAM_USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const INSTAGRAM_URL_REGEX =
  /https:\/\/www\.instagram\.com\/[a-zA-Z0-9_]+/;
