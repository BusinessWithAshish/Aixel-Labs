import {
  INSTAGRAM_CTA_KEYWORDS,
  INSTAGRAM_INTELLIGENCE_PATTERNS,
} from "../constants";

export function computeCaptionLength(caption: string | null): number | null {
  if (caption === null) return null;
  return caption.length;
}

export function computeHashtagCount(caption: string | null): number | null {
  if (caption === null) return null;
  const matches = caption.match(INSTAGRAM_INTELLIGENCE_PATTERNS.HASHTAG);
  return matches === null ? 0 : matches.length;
}

/** Presence flag only, via keyword substring match — not a classifier of
 * CTA *type*. That interpretation belongs to the analysis layer. */
export function computeHasCTA(caption: string | null): boolean | null {
  if (caption === null) return null;
  const lower = caption.toLowerCase();
  return INSTAGRAM_CTA_KEYWORDS.some((keyword) => lower.includes(keyword));
}
