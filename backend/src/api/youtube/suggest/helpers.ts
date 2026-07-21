import {
  YOUTUBE_SUGGEST_CLIENT,
  YOUTUBE_SUGGEST_DATASET,
  YOUTUBE_SUGGEST_URL,
} from "../constants";
import {
  createYoutubeFetchSession,
  resolveYoutubeGeo,
} from "../helpers";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import {
  YOUTUBE_SUGGEST_JSONP_PREFIX,
  YOUTUBE_SUGGEST_JSONP_SUFFIX,
  YOUTUBE_SUGGEST_QUERY_PARAMS,
  YOUTUBE_SUGGEST_TYPE,
} from "./constants";
import type {
  YOUTUBE_SUGGEST_ITEM,
  YOUTUBE_SUGGEST_RAW_PAYLOAD,
  YOUTUBE_SUGGEST_REQUEST,
  YOUTUBE_SUGGEST_RESPONSE,
} from "./types";

/**
 * Strips the `window.google.ac.h(...)` JSONP wrapper and parses the inner
 * JSON array. Throws when the body is not a valid JSONP envelope.
 */
export function parseSuggestJsonp(
  body: string,
): YOUTUBE_SUGGEST_RAW_PAYLOAD {
  const trimmed = body.trim();

  const prefixEnd = trimmed.indexOf(YOUTUBE_SUGGEST_JSONP_PREFIX);
  if (prefixEnd !== 0) {
    throw new Error(
      "YouTube suggest response did not start with `window.google.ac.h(`",
    );
  }

  if (!trimmed.endsWith(YOUTUBE_SUGGEST_JSONP_SUFFIX)) {
    throw new Error("YouTube suggest response did not end with `)`");
  }

  const inner = trimmed.slice(
    YOUTUBE_SUGGEST_JSONP_PREFIX.length,
    trimmed.length - YOUTUBE_SUGGEST_JSONP_SUFFIX.length,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(inner);
  } catch {
    throw new Error("Failed to parse YouTube suggest JSONP payload as JSON");
  }

  if (!Array.isArray(parsed) || typeof parsed[0] !== "string") {
    throw new Error("YouTube suggest payload was not the expected `[query, suggestions[]]` shape");
  }

  return parsed as YOUTUBE_SUGGEST_RAW_PAYLOAD;
}

/** Maps the raw `[text, type, subtypes[]]` tuples to typed suggestion items. */
export function mapSuggestItems(
  raw: YOUTUBE_SUGGEST_RAW_PAYLOAD,
): YOUTUBE_SUGGEST_ITEM[] {
  const entries = raw[1] ?? [];
  const items: YOUTUBE_SUGGEST_ITEM[] = [];

  for (const entry of entries) {
    if (!Array.isArray(entry)) continue;
    const [text, type, subtypes] = entry;
    if (typeof text !== "string") continue;

    items.push({
      text,
      type: typeof type === "number" ? type : YOUTUBE_SUGGEST_TYPE.QUERY,
      subtypes: Array.isArray(subtypes) ? subtypes.filter((n) => typeof n === "number") : [],
    });
  }

  return items;
}

function buildSuggestUrl(request: YOUTUBE_SUGGEST_REQUEST): string {
  const { country, query, hl, cp } = request;
  const { gl } = resolveYoutubeGeo({ country });

  const url = new URL(YOUTUBE_SUGGEST_URL);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.DATASET, YOUTUBE_SUGGEST_DATASET);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.LANGUAGE, hl);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.GEO, gl);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.CLIENT, YOUTUBE_SUGGEST_CLIENT);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.CLIENT_GS_RI, YOUTUBE_SUGGEST_CLIENT);
  url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.QUERY, query);
  if (typeof cp === "number") {
    url.searchParams.set(YOUTUBE_SUGGEST_QUERY_PARAMS.CURSOR_POSITION, String(cp));
  }
  return url.toString();
}

/**
 * Fetches YouTube autocomplete suggestions for a partial query by calling
 * the same `suggestqueries-clients6.youtube.com/complete/search` endpoint
 * the YouTube web search box uses, then stripping the JSONP wrapper.
 *
 * The response preserves both the parsed suggestions and the raw JSONP body
 * so callers can inspect the original payload.
 */
export async function fetchYoutubeSuggest(
  request: YOUTUBE_SUGGEST_REQUEST,
): Promise<YOUTUBE_SUGGEST_RESPONSE> {
  const { country, query } = request;

  const session: UrlFetchSession = await createYoutubeFetchSession({
    country,
  });

  try {
    const url = buildSuggestUrl(request);
    const response = await session.get(url);
    if (!response.ok) {
      throw new Error(`YouTube suggest request failed: ${response.status}`);
    }

    const raw = await response.text();
    const parsed = parseSuggestJsonp(raw);
    const suggestions = mapSuggestItems(parsed);

    return {
      query: parsed[0],
      suggestions,
      totalResults: suggestions.length,
      raw,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
