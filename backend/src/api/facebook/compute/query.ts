import {
  FACEBOOK_GSEARCH_EXCLUDE_SEPARATOR,
  FACEBOOK_GSEARCH_OR_SEPARATOR,
  FACEBOOK_GSEARCH_PAGE_EXCLUDE_OPERATORS,
  FACEBOOK_GSEARCH_SITE_OPERATOR,
} from "../constants";
import type { FACEBOOK_REQUEST } from "../types";

export const generateAdvanceQuery = (
  keywords: string[] | undefined,
  separator: string = FACEBOOK_GSEARCH_OR_SEPARATOR,
) => {
  if (!keywords || keywords.length === 0) {
    return "";
  }
  return `(${keywords.map((keyword) => `${keyword}`).join(separator)})`;
};

export const generateExcludeKeywords = (
  keywords: string[] | undefined,
  separator: string = FACEBOOK_GSEARCH_EXCLUDE_SEPARATOR,
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
 * Builds a Facebook Google search query for business Pages.
 *
 * Anchors with `site:facebook.com` + slim `-inurl:` excludes (Instagram-style
 * bias toward entity pages). Do **not** embed city/state here — `fetchGsearch`
 * appends `in City, State` and routes via country `gl` / Evomi.
 */
export const generateFacebookSearchQuery = (request: FACEBOOK_REQUEST) => {
  const query = request.query ?? "";
  const keywords = generateAdvanceQuery(request.keywords);
  const excludeKeywords = generateExcludeKeywords(request.excludeKeywords);

  const finalQuery = [
    FACEBOOK_GSEARCH_SITE_OPERATOR,
    FACEBOOK_GSEARCH_PAGE_EXCLUDE_OPERATORS,
    query,
    keywords,
    excludeKeywords,
  ]
    .filter((part) => part.trim().length > 0)
    .join(" ");

  return {
    searchQuery: finalQuery.trim(),
    words: countWords(finalQuery),
    chars: finalQuery.length,
  };
};
