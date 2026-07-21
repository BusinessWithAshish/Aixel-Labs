import type { YOUTUBE_TRANSCRIPT_LINE } from "../../../transcript/types";
import {
  YOUTUBE_INTELLIGENCE_STOP_WORDS,
  YOUTUBE_TRANSCRIPT_KEYWORD_TOP_N,
  YOUTUBE_TRANSCRIPT_MIN_KEYWORD_LENGTH,
} from "../../constants";
import { tokeniseWords } from "../../compute/text";
import type { YOUTUBE_TRANSCRIPT_KEYWORD } from "../types";

/** Extracts the top-N most frequent meaningful terms (stop words excluded). */
export function extractTopKeywords(
  lines: YOUTUBE_TRANSCRIPT_LINE[],
  topN: number = YOUTUBE_TRANSCRIPT_KEYWORD_TOP_N,
): YOUTUBE_TRANSCRIPT_KEYWORD[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const tokens = tokeniseWords(line.text);
    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (YOUTUBE_INTELLIGENCE_STOP_WORDS.has(lower)) continue;
      if (lower.length < YOUTUBE_TRANSCRIPT_MIN_KEYWORD_LENGTH) continue;
      counts.set(lower, (counts.get(lower) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([term, frequency]) => ({ term, frequency }))
    .sort((a, b) => b.frequency - a.frequency || a.term.localeCompare(b.term))
    .slice(0, topN);
}
