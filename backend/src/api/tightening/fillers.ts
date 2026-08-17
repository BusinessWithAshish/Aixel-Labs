import type { GROQ_TRANSCRIPTION_WORD } from "../transcription/types";
import { TIGHTENING, TIGHTENING_DEFAULT_FILLER_WORDS } from "./constants";
import type { TIME_RANGE } from "./types";

/**
 * Folds a transcript token down to the form the filler dictionary is written
 * in: lowercase, no surrounding punctuation, and runs of a repeated letter
 * squeezed to one. That last step is what makes a single dictionary entry
 * cover the whole family a transcriber invents for the same sound — "Uhhh,"
 * "uhh", and "UH." all collapse to "uh", and "Hmmm" to "hm".
 *
 * The letter-squeeze is safe against real English words here only because it's
 * applied to BOTH sides of the comparison and the dictionary holds nothing
 * whose collapsed form collides with a content word. It is not a general-
 * purpose normalizer — a caller passing `fillerWords` should keep that in mind
 * (e.g. "all" would collapse to "al" and never match anything).
 */
export function normalizeWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']/gu, "")
    .replace(/(.)\1+/gu, "$1");
}

/**
 * Finds every filler word in a word-timestamped transcript and returns the
 * time range to cut for each.
 *
 * Two things keep these cuts off the neighbouring real words, which matters
 * because Whisper's word boundaries are only accurate to ~±100ms:
 *
 * 1. Each range is pulled INWARD by a guard band, so a boundary reported
 *    slightly early/late eats the filler rather than the first or last
 *    phoneme of the word next door. The guard is capped at a fraction of the
 *    filler's own length so that short fillers aren't guarded out of
 *    existence — see `FILLER_GUARD_MAX_FRACTION`.
 * 2. Each range is then clamped against the actual adjacent words' timings, so
 *    a cut can never cross into a word that is being kept — regardless of how
 *    wrong the transcriber's boundary was.
 *
 * The leftover sliver of the filler that this conservatively leaves behind is
 * near-silent by nature, so the silence pass generally absorbs it.
 */
export function findFillerRanges(
  words: GROQ_TRANSCRIPTION_WORD[],
  fillerWords?: readonly string[],
): TIME_RANGE[] {
  const dictionary = new Set(
    (fillerWords ?? TIGHTENING_DEFAULT_FILLER_WORDS).map(normalizeWord),
  );
  const ranges: TIME_RANGE[] = [];

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!dictionary.has(normalizeWord(word.word))) continue;

    const guard = Math.min(
      TIGHTENING.FILLER_INWARD_GUARD_SECONDS,
      (word.end - word.start) * TIGHTENING.FILLER_GUARD_MAX_FRACTION,
    );

    const previousEnd = i > 0 ? words[i - 1].end : 0;
    const nextStart = i < words.length - 1 ? words[i + 1].start : Number.POSITIVE_INFINITY;

    const start = Math.max(previousEnd, word.start + guard);
    const end = Math.min(nextStart, word.end - guard);

    if (end - start >= TIGHTENING.MIN_REMOVAL_SECONDS) {
      ranges.push({ start, end });
    }
  }

  return ranges;
}
