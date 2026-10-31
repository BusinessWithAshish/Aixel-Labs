import {
  LINE_FINDER_EVERYDAY_WORDS,
  LINE_FINDER_MATCH_KIND,
  LINE_FINDER_NEGATIONS,
  LINE_FINDER_PLAYER,
  LINE_FINDER_SCORE,
} from "../constants";
import type { LINE_FINDER_MATCH_KIND_VALUE } from "../types";

export type WindowMatch = {
  kind: LINE_FINDER_MATCH_KIND_VALUE;
  score: number;
  /** The window says no and the query doesn't (spec §4.5). */
  saysNo: boolean;
  /** Positions in the window of the first and last matched word. */
  firstWord: number;
  lastWord: number;
};

/** True when one edit (add, drop or change a letter) turns `a` into `b`. */
function isOneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function wordsMatch(queryWord: string, windowWord: string): boolean {
  if (queryWord === windowWord) return true;
  return queryWord.length >= LINE_FINDER_SCORE.FUZZY_MIN_LENGTH && isOneEditApart(queryWord, windowWord);
}

function wordWeight(word: string): number {
  return LINE_FINDER_EVERYDAY_WORDS.has(word) ? LINE_FINDER_SCORE.EVERYDAY_WORD_WEIGHT : 1;
}

/** Where the query's words sit side by side, in order, with no fuzziness. */
function exactRunAt(query: string[], window: string[]): number {
  for (let start = 0; start + query.length <= window.length; start++) {
    if (query.every((word, i) => window[start + i] === word)) return start;
  }
  return -1;
}

/** Scores one window against a query. Null when it's too far off to show. */
export function matchWindow(query: string[], window: string[]): WindowMatch | null {
  if (query.length === 0 || window.length === 0) return null;

  const queryHasNo = query.some((w) => LINE_FINDER_NEGATIONS.has(w));
  /** A "no" among the matched words or just after them. Further away, it belongs to another sentence. */
  const saysNoNear = (first: number, last: number, reach: number) =>
    !queryHasNo && window.slice(first, last + reach + 1).some((w) => LINE_FINDER_NEGATIONS.has(w));

  const run = exactRunAt(query, window);
  if (run >= 0) {
    const lastOfRun = run + query.length - 1;
    if (!saysNoNear(run, lastOfRun, LINE_FINDER_SCORE.NEGATION_REACH_EXACT)) {
      return { kind: LINE_FINDER_MATCH_KIND.EXACT, score: 1, saysNo: false, firstWord: run, lastWord: lastOfRun };
    }
  }

  let matchedWeight = 0;
  let totalWeight = 0;
  let matchedWords = 0;
  let matchedStrong = false;
  let firstWord = Infinity;
  let lastWord = -1;
  const used = new Set<number>();

  for (const word of query) {
    const weight = wordWeight(word);
    totalWeight += weight;
    const at = window.findIndex((w, i) => !used.has(i) && wordsMatch(word, w));
    if (at < 0) continue;
    used.add(at);
    matchedWeight += weight;
    matchedWords++;
    if (weight === 1) matchedStrong = true;
    firstWord = Math.min(firstWord, at);
    lastWord = Math.max(lastWord, at);
  }

  const score = matchedWeight / totalWeight;

  // A one-word query has nothing else to go on, so one match can be enough for it.
  const enoughWords = matchedWords >= Math.min(LINE_FINDER_SCORE.SIMILAR_MIN_WORDS, query.length);
  if (score < LINE_FINDER_SCORE.SIMILAR || !enoughWords || !matchedStrong) return null;

  const saysNo = saysNoNear(firstWord, lastWord, LINE_FINDER_SCORE.NEGATION_REACH_LOOSE);
  const kind =
    !saysNo && score >= LINE_FINDER_SCORE.CLOSE ? LINE_FINDER_MATCH_KIND.CLOSE : LINE_FINDER_MATCH_KIND.SIMILAR;
  return { kind, score, saysNo, firstWord, lastWord };
}

/** The moment to play, in whole seconds (spec §5). `end` counts from the start of the video. */
export function playerTimes(firstWordMs: number, lastWordMs: number): { startSeconds: number; endSeconds: number } {
  const startSeconds = Math.max(0, Math.floor((firstWordMs - LINE_FINDER_PLAYER.LEAD_IN_MS) / 1000));
  const endSeconds = Math.max(startSeconds + 1, Math.ceil((lastWordMs + LINE_FINDER_PLAYER.LEAD_OUT_MS) / 1000));
  return { startSeconds, endSeconds };
}
