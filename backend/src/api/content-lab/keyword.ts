import type { z } from "zod";
import { fetchGoogleTrendsInterest } from "../google-trends/interest/helpers";
import { GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA } from "../google-trends/interest/schemas";
import { GOOGLE_TRENDS_PROPERTY } from "../google-trends/constants";
import { fetchYoutubeSuggest } from "../youtube/suggest/helpers";
import { createTtlCache } from "./cache";
import { scoreKeyword, summarizeTrend } from "./compute";
import { CONTENT_LAB_CACHE, CONTENT_LAB_KEYWORD } from "./constants";
import { beforeDeadline, errorMessage } from "./helpers";
import type { CONTENT_LAB_KEYWORD_REQUEST_SCHEMA } from "./schemas";
import type { CONTENT_LAB_KEYWORD_RESPONSE, CONTENT_LAB_KEYWORD_TREND } from "./types";

export type ContentLabKeywordInput = z.output<typeof CONTENT_LAB_KEYWORD_REQUEST_SCHEMA>;

const WEEK_SECONDS = 7 * 86_400;

const searchesCache =createTtlCache<string[]>(CONTENT_LAB_CACHE.suggestTtlMs, CONTENT_LAB_CACHE.suggestMaxEntries);
const trendCache = createTtlCache<CONTENT_LAB_KEYWORD_TREND | null>(CONTENT_LAB_CACHE.trendTtlMs, CONTENT_LAB_CACHE.trendMaxEntries);

/** YouTube's autocomplete for the topic (~0.3 s): what people actually type. */
const youtubeSearches = (query: string, country: string) =>
  searchesCache.get(`${country}:${query}`, async () => {
    const { suggestions } = await fetchYoutubeSuggest({ query, country, hl: "en" });
    return suggestions.map((s) => s.text);
  });

/** 12 months of weekly YouTube search interest in the country (~2 s). */
const youtubeTrend = (query: string, country: string) =>
  trendCache.get(`${country}:${query}`, async () => {
    const interest = await fetchGoogleTrendsInterest(
      GOOGLE_TRENDS_INTEREST_REQUEST_SCHEMA.parse({ keyword: query, geo: country, property: GOOGLE_TRENDS_PROPERTY.YOUTUBE }),
    );
    // The current week is still filling up: counting it would read as a drop.
    const complete = interest.interestOverTime.filter((point) => (point.time + WEEK_SECONDS) * 1000 <= Date.now());
    return summarizeTrend(
      complete.map((point) => point.values[0] ?? 0),
      interest.risingRelatedQueries.map((q) => q.query),
    );
  });

/**
 * How much a topic is searched on YouTube and where it is heading, for the
 * search box (typed: `trend: false`, fast) and the results page (`trend: true`).
 * Autocomplete and Trends run in parallel; Trends gets
 * `CONTENT_LAB_KEYWORD.trendTimeoutMs` and failing it only drops the trend.
 */
export async function contentLabKeywordService(input: ContentLabKeywordInput): Promise<CONTENT_LAB_KEYWORD_RESPONSE> {
  const query = input.query.trim().toLowerCase();
  const trendPromise = input.trend
    ? beforeDeadline(
        youtubeTrend(query, input.country).catch((err) => {
          console.warn("[content-lab] keyword trend failed:", query, errorMessage(err));
          return null;
        }),
        Date.now() + CONTENT_LAB_KEYWORD.trendTimeoutMs,
      )
    : Promise.resolve(null);
  const [all, trend] = await Promise.all([youtubeSearches(query, input.country), trendPromise]);
  const searches = all.filter((text) => text.trim().toLowerCase() !== query);
  return { query: input.query, country: input.country, searches, trend, ...scoreKeyword(all.length, trend) };
}
