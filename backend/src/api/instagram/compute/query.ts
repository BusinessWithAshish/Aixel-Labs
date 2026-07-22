import {
  INSTAGRAM_GSEARCH_EXCLUDE_SEPARATOR,
  INSTAGRAM_GSEARCH_OR_SEPARATOR,
  INSTAGRAM_GSEARCH_PROFILE_TITLE_OPERATOR,
  INSTAGRAM_GSEARCH_SITE_OPERATOR,
} from "../constants";
import type { INSTAGRAM_REQUEST } from "../types";

export const generateAdvanceQuery = (
  keywords: string[] | undefined,
  separator: string = INSTAGRAM_GSEARCH_OR_SEPARATOR,
) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return `(${keywords.map((keyword) => `${keyword}`).join(separator)})`;
};

export const generateExcludeKeywords = (
  keywords: string[] | undefined,
  separator: string = INSTAGRAM_GSEARCH_EXCLUDE_SEPARATOR,
) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return `-${keywords.map((keyword) => `${keyword}`).join(separator)}`;
};

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Builds an Instagram Google search query respecting limits (1900 chars, 30 words).
 * Always anchors to profile pages via `site:instagram.com intitle:"Instagram photos and videos"`.
 * Priority after that: query > keywords > hashtags > excludeKeywords > excludeHashtags.
 */
export const generateInstagramSearchQuery = (request: INSTAGRAM_REQUEST) => {
  const query = request.query ?? "";

  const keywords = generateAdvanceQuery(request.keywords);
  const hashtags = generateAdvanceQuery(request.hashtags);
  const excludeKeywords = generateExcludeKeywords(request.excludeKeywords);
  const excludeHashtags = generateExcludeKeywords(request.excludeHashtags);

  const finalQuery = [
    INSTAGRAM_GSEARCH_SITE_OPERATOR,
    INSTAGRAM_GSEARCH_PROFILE_TITLE_OPERATOR,
    query,
    keywords,
    hashtags,
    excludeKeywords,
    excludeHashtags,
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ");

  return {
    searchQuery: finalQuery.trim(),
    words: countWords(finalQuery),
    chars: finalQuery.length,
  };
};
