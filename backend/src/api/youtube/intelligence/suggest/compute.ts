import {
  YOUTUBE_INTELLIGENCE_PATTERNS,
  YOUTUBE_INTELLIGENCE_STOP_WORDS,
  YOUTUBE_SUGGEST_CLUSTER_NGRAM_SIZES,
  YOUTUBE_SUGGEST_LANGUAGE_MODIFIERS,
  YOUTUBE_SUGGEST_MAX_CLUSTERS,
  YOUTUBE_SUGGEST_MIN_CLUSTER_SIZE,
} from "../constants";
import { tokenisePreservingCase } from "../compute";
import type {
  YOUTUBE_SUGGEST_INTELLIGENCE_ITEM,
  YOUTUBE_SUGGEST_KEYWORD_CLUSTER,
} from "./types";

const LANGUAGE_MODIFIER_SET = new Set(
  YOUTUBE_SUGGEST_LANGUAGE_MODIFIERS.map((m) => m.toLowerCase()),
);

/** Detects whether a suggestion contains a 4-digit year. */
export function detectYear(text: string): boolean {
  return YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_YEAR.test(text);
}

/** Detects a language / geo modifier token in the suggestion. */
export function detectLanguageModifier(text: string): string | null {
  const tokens = tokenisePreservingCase(text);
  for (const t of tokens) {
    if (LANGUAGE_MODIFIER_SET.has(t.lower)) {
      return t.lower;
    }
  }
  return null;
}

/**
 * Detects brand / proper-noun tokens: words that are capitalised mid-sentence
 * (not the first word) and not in the stop-word list. The first word is
 * excluded because it is capitalised by convention regardless of being a
 * proper noun.
 */
export function detectBrandNames(text: string): string[] {
  const tokens = tokenisePreservingCase(text);
  const brands: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const { lower, original } = tokens[i];
    if (i === 0) continue; // first word capitalised by convention
    if (YOUTUBE_INTELLIGENCE_STOP_WORDS.has(lower)) continue;
    if (!YOUTUBE_INTELLIGENCE_PATTERNS.PROPER_NOUN_START.test(original)) continue;
    // Skip pure numbers / years.
    if (YOUTUBE_INTELLIGENCE_PATTERNS.PURE_NUMBER.test(original)) continue;
    brands.push(original);
  }
  return brands;
}

/** Builds a single enriched suggestion item. */
export function buildSuggestItem(
  text: string,
  depth: number,
): YOUTUBE_SUGGEST_INTELLIGENCE_ITEM {
  const languageModifier = detectLanguageModifier(text);
  const brandNames = detectBrandNames(text);
  return {
    text,
    depth,
    hasYear: detectYear(text),
    hasLanguageModifier: languageModifier !== null,
    languageModifier,
    hasBrandName: brandNames.length > 0,
    brandNames,
  };
}

/**
 * Computes keyword clusters: groups of suggestions sharing a common 2–3 word
 * phrase. Returns the largest clusters first, capped at
 * `YOUTUBE_SUGGEST_MAX_CLUSTERS` and only clusters with at least
 * `YOUTUBE_SUGGEST_MIN_CLUSTER_SIZE` members.
 */
export function computeKeywordClusters(
  suggestions: string[],
): YOUTUBE_SUGGEST_KEYWORD_CLUSTER[] {
  const phraseToMembers = new Map<string, Set<string>>();

  for (const suggestion of suggestions) {
    const tokens = tokenisePreservingCase(suggestion).map((t) => t.lower);
    if (tokens.length < 2) continue;

    // Generate n-grams from meaningful (non-stop-word) tokens.
    for (const size of YOUTUBE_SUGGEST_CLUSTER_NGRAM_SIZES) {
      for (let i = 0; i + size <= tokens.length; i++) {
        const window = tokens.slice(i, i + size);
        // Skip windows where every token is a stop word.
        if (window.every((w) => YOUTUBE_INTELLIGENCE_STOP_WORDS.has(w))) continue;
        const phrase = window.join(" ");
        const members = phraseToMembers.get(phrase) ?? new Set<string>();
        members.add(suggestion);
        phraseToMembers.set(phrase, members);
      }
    }
  }

  const clusters: YOUTUBE_SUGGEST_KEYWORD_CLUSTER[] = [];
  for (const [phrase, members] of phraseToMembers) {
    if (members.size >= YOUTUBE_SUGGEST_MIN_CLUSTER_SIZE) {
      clusters.push({
        phrase,
        size: members.size,
        members: [...members],
      });
    }
  }

  // Sort by size descending, then phrase alphabetically for stable ordering.
  clusters.sort(
    (a, b) => b.size - a.size || a.phrase.localeCompare(b.phrase),
  );

  return clusters.slice(0, YOUTUBE_SUGGEST_MAX_CLUSTERS);
}

/** Deduplicates an array of strings, preserving first-occurrence order. */
export function dedupePreservingOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}
