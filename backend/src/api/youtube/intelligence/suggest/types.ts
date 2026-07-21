import type { WithIntelligence } from "../types";

/** A single suggestion enriched with intelligence fields. */
export type YOUTUBE_SUGGEST_INTELLIGENCE_ITEM = {
  /** The suggestion text. */
  text: string;
  /**
   * Depth at which the suggestion was found.
   * `0` = returned directly from the seed query.
   * `1` = returned from a suggestion of the seed query (one level of recursion).
   */
  depth: number;
  /** `true` when the suggestion contains a 4-digit year (recency-dependent demand). */
  hasYear: boolean;
  /** `true` when the suggestion contains a language or country modifier token. */
  hasLanguageModifier: boolean;
  /** The detected language/geo modifier token, if any (lower-cased). */
  languageModifier: string | null;
  /** `true` when the suggestion contains a word that looks like a proper noun / brand. */
  hasBrandName: boolean;
  /** The detected brand/proper-noun tokens, if any (original casing preserved). */
  brandNames: string[];
};

/** A keyword cluster — suggestions sharing a common 2–3 word phrase. */
export type YOUTUBE_SUGGEST_KEYWORD_CLUSTER = {
  /** The shared phrase that defines the cluster. */
  phrase: string;
  /** Number of suggestions in the cluster. */
  size: number;
  /** The suggestions in the cluster (text only). */
  members: string[];
};

export type YOUTUBE_SUGGEST_INTELLIGENCE_FIELDS = {
  /** Total unique suggestion count across all depths. */
  totalUniqueSuggestions: number;
  /** Number of suggestions found at depth 0 (directly from the seed). */
  depthZeroCount: number;
  /** Number of suggestions found at depth 1 (from a suggestion of the seed). */
  depthOneCount: number;
  /** Distinct competitor / brand names detected across all suggestions. */
  competitors: string[];
  /** Distinct language / geo modifier tokens detected across all suggestions. */
  languageModifiers: string[];
  /** Keyword clusters — groups of suggestions sharing a common 2–3 word phrase. */
  keywordClusters: YOUTUBE_SUGGEST_KEYWORD_CLUSTER[];
};

export type YOUTUBE_SUGGEST_INTELLIGENCE_RESPONSE = {
  /** The seed query that produced the keyword tree. */
  seedQuery: string;
  /** All unique suggestions across all depths, enriched with intelligence fields. */
  suggestions: YOUTUBE_SUGGEST_INTELLIGENCE_ITEM[];
  /** Aggregate intelligence computed across all suggestions. */
  intelligence: YOUTUBE_SUGGEST_INTELLIGENCE_FIELDS;
};
