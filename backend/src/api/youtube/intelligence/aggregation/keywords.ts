import type { z } from "zod";
import { YOUTUBE_INTELLIGENCE_PATTERNS } from "../constants";
import { computeAverage, computeTruthyRatio } from "../math";
import type { AGGREGATE_KEYWORD_SIGNALS_SCHEMA } from "./schemas";
import type {
  YOUTUBE_KEYWORD_SIGNAL,
  YOUTUBE_KEYWORD_SIGNALS_RESPONSE,
} from "./types";

export type AggregateKeywordSignalsInput = z.infer<
  typeof AGGREGATE_KEYWORD_SIGNALS_SCHEMA
>;

type KeywordVideoItem = {
  title?: string | null;
  intelligence?: {
    velocityScore?: number | null;
    titleLength?: number | null;
    titleHasNumber?: boolean;
    titleHasQuestion?: boolean;
    titleHasYear?: boolean;
  };
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
  "you",
  "your",
  // Common ≥3-char stopwords that otherwise dominate velocityLift rankings
  "this",
  "that",
  "these",
  "those",
  "just",
  "most",
  "more",
  "than",
  "then",
  "when",
  "what",
  "which",
  "who",
  "will",
  "was",
  "were",
  "been",
  "have",
  "has",
  "had",
  "not",
  "but",
  "all",
  "any",
  "can",
  "into",
  "about",
  "after",
  "over",
  "also",
  "very",
  "even",
  "still",
  "here",
  "there",
  "now",
  "out",
  "off",
  "our",
  "their",
  "them",
  "his",
  "her",
  "its",
  "day",
  "days",
  "year",
  "years",
  "right",
  "get",
  "got",
  "make",
  "made",
  "like",
  "one",
  "two",
  "new",
  "best",
  "top",
  "way",
  "ways",
  "thing",
  "things",
  "everything",
  "something",
  "showing",
  "using",
  "doing",
  "going",
]);

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_WORDS)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token),
    );
}

function asKeywordItems(items: unknown[]): KeywordVideoItem[] {
  return items.filter(
    (item): item is KeywordVideoItem =>
      typeof item === "object" && item !== null,
  );
}

export function aggregateKeywordSignalsService(
  input: AggregateKeywordSignalsInput,
): YOUTUBE_KEYWORD_SIGNALS_RESPONSE {
  const items = asKeywordItems(input.items);
  const top: KeywordVideoItem[] = [];
  const bottom: KeywordVideoItem[] = [];

  for (const item of items) {
    const velocity = item.intelligence?.velocityScore;
    if (velocity == null) continue;
    if (velocity >= input.topQuartileThreshold) top.push(item);
    else bottom.push(item);
  }

  const keywordStats = new Map<
    string,
    {
      frequency: number;
      velocitySum: number;
      velocityCount: number;
      topQuartileFrequency: number;
      bottomQuartileFrequency: number;
    }
  >();

  const bump = (
    keyword: string,
    bucket: "all" | "top" | "bottom",
    velocity: number | null | undefined,
  ) => {
    const current = keywordStats.get(keyword) ?? {
      frequency: 0,
      velocitySum: 0,
      velocityCount: 0,
      topQuartileFrequency: 0,
      bottomQuartileFrequency: 0,
    };

    if (bucket === "all") {
      current.frequency += 1;
      if (velocity != null) {
        current.velocitySum += velocity;
        current.velocityCount += 1;
      }
    } else if (bucket === "top") {
      current.topQuartileFrequency += 1;
    } else {
      current.bottomQuartileFrequency += 1;
    }

    keywordStats.set(keyword, current);
  };

  for (const item of items) {
    const title = item.title;
    if (!title) continue;
    for (const token of new Set(tokenizeTitle(title))) {
      bump(token, "all", item.intelligence?.velocityScore);
    }
  }

  for (const item of top) {
    const title = item.title;
    if (!title) continue;
    for (const token of new Set(tokenizeTitle(title))) {
      bump(token, "top", null);
    }
  }

  for (const item of bottom) {
    const title = item.title;
    if (!title) continue;
    for (const token of new Set(tokenizeTitle(title))) {
      bump(token, "bottom", null);
    }
  }

  const keywords: YOUTUBE_KEYWORD_SIGNAL[] = [...keywordStats.entries()]
    .map(([keyword, stats]) => {
      const topFreq = stats.topQuartileFrequency;
      const bottomFreq = stats.bottomQuartileFrequency;
      // Real lift ratio. null when the keyword never appears in the bottom
      // quartile (undefined, not "capped to topFreq") — exposed separately as
      // `topQuartileExclusive` so consumers can still rank exclusive-to-top
      // keywords without conflating them with 5/1 == 5/0 artifacts.
      const velocityLift =
        bottomFreq === 0 ? null : topFreq / bottomFreq;
      return {
        keyword,
        frequency: stats.frequency,
        avgVelocityScore:
          stats.velocityCount > 0
            ? stats.velocitySum / stats.velocityCount
            : null,
        topQuartileFrequency: topFreq,
        bottomQuartileFrequency: bottomFreq,
        velocityLift,
        topQuartileExclusive: bottomFreq === 0 && topFreq > 0,
      };
    })
    .sort((a, b) => {
      // Rank real lift first (nulls last), then exclusive-to-top keywords,
      // then raw frequency as a tiebreaker.
      if (a.velocityLift !== null && b.velocityLift !== null) {
        if (a.velocityLift !== b.velocityLift) {
          return b.velocityLift - a.velocityLift;
        }
      } else if (a.velocityLift !== null) {
        return -1;
      } else if (b.velocityLift !== null) {
        return 1;
      }
      if (a.topQuartileExclusive !== b.topQuartileExclusive) {
        return a.topQuartileExclusive ? -1 : 1;
      }
      return b.frequency - a.frequency;
    })
    .slice(0, input.maxKeywords);

  const topTitleLengths = top
    .map((item) => item.intelligence?.titleLength)
    .filter((value): value is number => value != null);
  const bottomTitleLengths = bottom
    .map((item) => item.intelligence?.titleLength)
    .filter((value): value is number => value != null);

  return {
    keywords,
    titlePatterns: {
      numberRatioInTopQuartile: computeTruthyRatio(
        top,
        (item) => item.intelligence?.titleHasNumber === true,
      ),
      questionRatioInTopQuartile: computeTruthyRatio(
        top,
        (item) => item.intelligence?.titleHasQuestion === true,
      ),
      yearRatioInTopQuartile: computeTruthyRatio(
        top,
        (item) => item.intelligence?.titleHasYear === true,
      ),
      avgTitleLengthInTopQuartile: computeAverage(topTitleLengths),
      avgTitleLengthInBottomQuartile: computeAverage(bottomTitleLengths),
    },
  };
}
