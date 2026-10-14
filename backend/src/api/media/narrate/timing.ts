import { MEDIA_NARRATE_GEMINI } from "./constants";
import type { NARRATE_WORD } from "./types";

/**
 * Word times for audio whose engine gives none (provider "gemini").
 *
 * Whisper hears the audio and returns its own words with times; this matches
 * them back to the script's words in order, so the captions and footage
 * phrases show what was WRITTEN at the moment it was SAID. Whisper spells
 * differently (नुक़्ता dropped, English loanwords in Devanagari, words split or
 * merged), so a match is fuzzy: character-bigram overlap after normalising.
 * A script word Whisper did not hear sits between its matched neighbours,
 * sharing that gap by length.
 */

type HEARD_WORD = { word: string; start: number; end: number };

/** Strip what Whisper and the script disagree on without changing the word. */
function normalise(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFC")
    .replace(/़/g, "") // nukta: ज़ → ज
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

function bigrams(word: string): string[] {
  const chars = Array.from(word);
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
}

/** Dice coefficient over character bigrams, 0..1. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of right) pool.set(g, (pool.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of left) {
    const count = pool.get(g) ?? 0;
    if (count > 0) {
      shared++;
      pool.set(g, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * Best in-order matching of script words to heard words (a global alignment
 * where only similar words may pair and gaps cost nothing), as a map from
 * script index to heard index.
 */
function matchInOrder(script: string[], heard: string[]): Map<number, number> {
  const n = script.length;
  const m = heard.length;
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sim = similarity(script[i - 1], heard[j - 1]);
      const pair = sim >= MEDIA_NARRATE_GEMINI.MATCH_MIN_SIMILARITY ? score[i - 1][j - 1] + sim : -1;
      score[i][j] = Math.max(score[i - 1][j], score[i][j - 1], pair);
    }
  }
  const pairs = new Map<number, number>();
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (score[i][j] === score[i - 1][j]) {
      i--;
    } else if (score[i][j] === score[i][j - 1]) {
      j--;
    } else {
      pairs.set(i - 1, j - 1);
      i--;
      j--;
    }
  }
  return pairs;
}

/**
 * One timed word per script token. `matchedShare` is the fraction of script
 * words Whisper actually heard; the rest were placed between neighbours.
 */
export function timeScriptWords(
  tokens: string[],
  heard: HEARD_WORD[],
  durationSeconds: number,
): { words: NARRATE_WORD[]; matchedShare: number } {
  const pairs = matchInOrder(tokens.map(normalise), heard.map((h) => normalise(h.word)));

  const starts: (number | undefined)[] = tokens.map((_, i) => {
    const h = pairs.get(i);
    return h === undefined ? undefined : heard[h].start;
  });
  const ends: (number | undefined)[] = tokens.map((_, i) => {
    const h = pairs.get(i);
    return h === undefined ? undefined : heard[h].end;
  });

  // Fill each run of unheard words across the gap its neighbours leave, by length.
  let i = 0;
  while (i < tokens.length) {
    if (starts[i] !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (j < tokens.length && starts[j] === undefined) j++;
    const from = i > 0 ? (ends[i - 1] as number) : 0;
    const to = j < tokens.length ? (starts[j] as number) : durationSeconds;
    const lengths = tokens.slice(i, j).map((t) => Math.max(1, Array.from(t).length));
    const total = lengths.reduce((a, b) => a + b, 0);
    let cursor = from;
    for (let k = i; k < j; k++) {
      const span = ((to - from) * lengths[k - i]) / total;
      starts[k] = cursor;
      ends[k] = cursor + span;
      cursor += span;
    }
    i = j;
  }

  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    words: tokens.map((word, k) => ({
      word,
      start: round(starts[k] as number),
      end: round(Math.max(starts[k] as number, ends[k] as number)),
    })),
    matchedShare: tokens.length ? round(pairs.size / tokens.length) : 0,
  };
}
