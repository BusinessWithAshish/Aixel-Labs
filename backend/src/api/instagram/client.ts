import type { CountryCode } from "libphonenumber-js";

import { fetchUrls } from "../../utils/node-tls-client-session-handler";
import { fetchGsearch } from "../gsearch";
import {
  GSEARCH_MAX_PAGES,
  GSEARCH_MAX_QUERY_CHARS,
} from "../gsearch/constants";
import {
  IG_HEADERS,
  INSTAGRAM_BASE_URL,
  INSTAGRAM_ERROR_MESSAGES,
  INSTAGRAM_QUERY_LIMITS,
  INSTAGRAM_WEB_PROFILE_INFO_PATH,
} from "./constants";
import {
  generateInstagramSearchQuery,
  mapInstagramWebProfileBody,
  uniqueUsernames,
} from "./compute";
import type { INSTAGRAM_REQUEST, INSTAGRAM_RESPONSE } from "./types";

export function instagramWebProfileInfoUrl(username: string): string {
  return `${INSTAGRAM_BASE_URL}${INSTAGRAM_WEB_PROFILE_INFO_PATH}?username=${encodeURIComponent(username)}`;
}

export async function fetchFromEntities(
  entities: string[] | (string | null)[],
  country: string,
): Promise<INSTAGRAM_RESPONSE[]> {
  if (!Array.isArray(entities)) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.ENTITIES_NOT_ARRAY);
  }

  const usernames = uniqueUsernames(entities);
  const urls = usernames.map(instagramWebProfileInfoUrl);

  if (urls.length === 0) {
    return [];
  }

  const countryCode = country as CountryCode;

  // Flat targets → one TLS session + fresh Evomi sticky proxy per profile URL.
  return fetchUrls<INSTAGRAM_RESPONSE>({
    targets: urls,
    headers: IG_HEADERS,
    mapper: (text) => mapInstagramWebProfileBody(text, countryCode),
  });
}

export async function fetchFromQuery(
  data: INSTAGRAM_REQUEST,
): Promise<INSTAGRAM_RESPONSE[]> {
  const { country, city, state } = data;

  const { searchQuery, words, chars } = generateInstagramSearchQuery(data);

  if (
    chars > GSEARCH_MAX_QUERY_CHARS ||
    words > INSTAGRAM_QUERY_LIMITS.maxQueryWords
  ) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.QUERY_TOO_LONG);
  }

  const countryCode = country as CountryCode;

  const { results: searchResultsData } = await fetchGsearch({
    searchQuery,
    pages: GSEARCH_MAX_PAGES,
    country: countryCode,
    region: city,
    state,
  });

  if (!searchResultsData.length) {
    throw new Error(INSTAGRAM_ERROR_MESSAGES.GSEARCH_EMPTY);
  }

  // SERP URLs like /handle/reel/… or /handle/tagged/… still yield the profile handle
  // from the first path segment via `extractUsername` (same path as fetchFromEntities).
  const entities = uniqueUsernames(
    searchResultsData.map((row) => row.url ?? null),
  );

  console.log(
    `[instagram] SERP rows=${searchResultsData.length} → unique profile handles=${entities.length}`,
  );

  return await fetchFromEntities(entities, countryCode);
}
