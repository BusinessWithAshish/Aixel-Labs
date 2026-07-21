import {
  YOUTUBE_INTELLIGENCE_STOP_WORDS,
  YOUTUBE_TRANSCRIPT_MIN_KEYWORD_LENGTH,
  YOUTUBE_TRANSCRIPT_TITLE_INTRO_WEIGHT,
} from "../../constants";
import { tokeniseWords } from "../../compute/text";

/** Extracts significant (non-stop-word) lower-cased tokens from a title. */
export function extractTitleKeywords(title: string): string[] {
  const tokens = tokeniseWords(title);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const lower = token.toLowerCase();
    if (YOUTUBE_INTELLIGENCE_STOP_WORDS.has(lower)) continue;
    if (lower.length < YOUTUBE_TRANSCRIPT_MIN_KEYWORD_LENGTH) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(lower);
  }
  return out;
}

/**
 * Computes the title alignment score (0–1).
 *
 * For each significant title word, we check whether it appears in the full
 * transcript text. Words that also appear in the intro zone count double
 * (intro alignment is weighted 2x). The score is the weighted match count
 * divided by the total possible weighted count.
 *
 * Returns `null` when no title was provided or the title has no significant words.
 */
export function computeTitleAlignmentScore(
  title: string | null | undefined,
  fullText: string,
  introText: string,
): number | null {
  if (!title) return null;
  const titleKeywords = extractTitleKeywords(title);
  if (titleKeywords.length === 0) return null;

  const fullLower = fullText.toLowerCase();
  const introLower = introText.toLowerCase();

  let weightedMatches = 0;
  let weightedTotal = 0;
  for (const keyword of titleKeywords) {
    // Intro appearance counts double; full-transcript appearance counts once.
    const weight = YOUTUBE_TRANSCRIPT_TITLE_INTRO_WEIGHT;
    weightedTotal += weight;
    const inIntro = introLower.includes(keyword);
    const inFull = fullLower.includes(keyword);
    if (inIntro) {
      weightedMatches += weight;
    } else if (inFull) {
      weightedMatches += 1;
    }
  }
  return Math.round((weightedMatches / weightedTotal) * 100) / 100;
}
