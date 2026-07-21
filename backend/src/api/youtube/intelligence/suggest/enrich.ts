import type { z } from "zod";
import { fetchYoutubeSuggest } from "../../suggest/helpers";
import type { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "../../suggest/schemas";
import {
  buildSuggestItem,
  computeKeywordClusters,
  dedupePreservingOrder,
} from "./compute";
import type {
  YOUTUBE_SUGGEST_INTELLIGENCE_FIELDS,
  YOUTUBE_SUGGEST_INTELLIGENCE_ITEM,
  YOUTUBE_SUGGEST_INTELLIGENCE_RESPONSE,
} from "./types";

/**
 * Fetches the seed query's suggestions (depth 0), then for each suggestion
 * fetches its own suggestions (depth 1) — one level of recursion only.
 *
 * All depth-1 fetches run in parallel via `Promise.all` to keep latency low.
 * Suggestions are deduplicated across the full result set (case-insensitive).
 */
export async function enrichSuggestIntelligence(
  input: z.infer<typeof YOUTUBE_SUGGEST_REQUEST_SCHEMA>,
): Promise<YOUTUBE_SUGGEST_INTELLIGENCE_RESPONSE> {
  // Depth 0 — seed query.
  const seedResponse = await fetchYoutubeSuggest(input);
  const seedSuggestions = seedResponse.suggestions.map((s) => s.text);

  // Depth 1 — recurse on each depth-0 suggestion (one level only).
  const depthOneRawArrays = await Promise.all(
    seedSuggestions.map((suggestion) =>
      fetchYoutubeSuggest({ ...input, query: suggestion }).then(
        (r) => r.suggestions.map((s) => s.text),
      ).catch((err) => {
        console.error(
          "[YOUTUBE/INTELLIGENCE/SUGGEST] depth-1 fetch failed for query:",
          suggestion,
          err instanceof Error ? err.message : err,
        );
        return [] as string[];
      }),
    ),
  );

  // Build the unique set, tracking depth per suggestion (lowest depth wins).
  const seen = new Map<string, number>(); // lower-cased text → depth
  const orderedTexts: string[] = [];

  function add(text: string, depth: number) {
    const key = text.toLowerCase();
    const existing = seen.get(key);
    if (existing === undefined) {
      seen.set(key, depth);
      orderedTexts.push(text);
    } else if (existing > depth) {
      // Prefer the shallower depth.
      seen.set(key, depth);
    }
  }

  for (const s of seedSuggestions) add(s, 0);
  for (const arr of depthOneRawArrays) {
    for (const s of arr) add(s, 1);
  }

  // Build enriched items using the final (lowest) depth for each suggestion.
  const suggestions: YOUTUBE_SUGGEST_INTELLIGENCE_ITEM[] = orderedTexts.map(
    (text) => buildSuggestItem(text, seen.get(text.toLowerCase()) ?? 0),
  );

  // Aggregate intelligence.
  const depthZeroCount = suggestions.filter((s) => s.depth === 0).length;
  const depthOneCount = suggestions.length - depthZeroCount;

  const competitors = dedupePreservingOrder(
    suggestions.flatMap((s) => s.brandNames),
  );
  const languageModifiers = dedupePreservingOrder(
    suggestions
      .map((s) => s.languageModifier)
      .filter((m): m is string => m !== null),
  );
  const keywordClusters = computeKeywordClusters(
    suggestions.map((s) => s.text),
  );

  const intelligence: YOUTUBE_SUGGEST_INTELLIGENCE_FIELDS = {
    totalUniqueSuggestions: suggestions.length,
    depthZeroCount,
    depthOneCount,
    competitors,
    languageModifiers,
    keywordClusters,
  };

  return {
    seedQuery: input.query,
    suggestions,
    intelligence,
  };
}
