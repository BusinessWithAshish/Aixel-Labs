import { YOUTUBE_INTELLIGENCE_PATTERNS } from "../constants";

export function computeDescriptionLength(
  description: string | null,
): number | null {
  return description?.length ?? null;
}

export function computeTagCount(keywords: string[]): number {
  return keywords.length;
}

function extractHashtags(...texts: Array<string | null>): string[] {
  const matches: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    matches.push(...(text.match(YOUTUBE_INTELLIGENCE_PATTERNS.HASHTAG) ?? []));
  }
  return matches;
}

export function computeHasHashtags(
  title: string | null,
  description: string | null,
): boolean {
  return extractHashtags(title, description).length > 0;
}

export function computeHashtagCount(
  title: string | null,
  description: string | null,
): number {
  return extractHashtags(title, description).length;
}

export function parseChannelKeywords(keywords: string | null): string[] {
  if (!keywords?.trim()) return [];

  const terms: string[] = [];
  for (const match of keywords.matchAll(
    YOUTUBE_INTELLIGENCE_PATTERNS.CHANNEL_KEYWORDS,
  )) {
    const term = (match[1] ?? match[2])?.trim().toLowerCase();
    if (term) terms.push(term);
  }

  return [...new Set(terms)];
}

export function computeKeywordCount(keywords: string | null): number {
  return parseChannelKeywords(keywords).length;
}
