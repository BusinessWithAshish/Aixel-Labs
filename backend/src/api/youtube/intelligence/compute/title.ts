import { YOUTUBE_INTELLIGENCE_PATTERNS } from "../constants";
import type {
  YOUTUBE_INTELLIGENCE_TITLE_LENGTH_FIELD,
  YOUTUBE_INTELLIGENCE_TITLE_PATTERN_FIELDS,
  YOUTUBE_INTELLIGENCE_TITLE_TEXT_FIELDS,
} from "../types";

export function computeTitleLength(title: string | null): number | null {
  return title?.length ?? null;
}

export function computeTitleWordCount(title: string | null): number | null {
  if (!title?.trim()) return title === null ? null : 0;
  return title.trim().split(YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_WORDS).length;
}

export function computeTitleHasNumber(title: string | null): boolean {
  if (!title) return false;
  return YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_HAS_NUMBER.test(title);
}

export function computeTitleHasQuestion(title: string | null): boolean {
  if (!title) return false;
  return YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_HAS_QUESTION.test(title);
}

export function computeTitleHasYear(title: string | null): boolean {
  if (!title) return false;
  return YOUTUBE_INTELLIGENCE_PATTERNS.TITLE_YEAR.test(title);
}

export function computeTitlePatternFields(
  title: string | null,
): YOUTUBE_INTELLIGENCE_TITLE_PATTERN_FIELDS {
  return {
    titleHasNumber: computeTitleHasNumber(title),
    titleHasQuestion: computeTitleHasQuestion(title),
    titleHasYear: computeTitleHasYear(title),
  };
}

export function computeTitleLengthField(
  title: string | null,
): YOUTUBE_INTELLIGENCE_TITLE_LENGTH_FIELD {
  return {
    titleLength: computeTitleLength(title),
  };
}

export function computeTitleTextFields(
  title: string | null,
): YOUTUBE_INTELLIGENCE_TITLE_TEXT_FIELDS {
  return {
    ...computeTitleLengthField(title),
    titleWordCount: computeTitleWordCount(title),
    ...computeTitlePatternFields(title),
  };
}
