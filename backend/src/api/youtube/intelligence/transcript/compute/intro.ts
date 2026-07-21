import type { YOUTUBE_TRANSCRIPT_LINE } from "../../../transcript/types";

const TRANSITION_PATTERNS: RegExp[] = [
  /\bso (today|in this video|let's|we're going to|we will|we'll)\b/i,
  /\blet'?s (get (into|started|started|going)|dive in|start|begin|jump in)\b/i,
  /\bthe first (thing|step|way|reason|tip)\b/i,
  /\bhere'?s (how|the|what|a)\b/i,
  /\blet me show you\b/i,
  /\bto (start|begin)\b/i,
  /\bfirst (up|of all|thing|let's)\b/i,
  /\bokay (so|now|let's)\b/i,
  /\balright (so|now|let's)\b/i,
  /\bnow (let's|we're|we can|we will)\b/i,
];

/**
 * Estimates how many seconds the speaker spends before transitioning from
 * setup / hook language into substantive content.
 *
 * Heuristic: scan transcript lines in order; the first line that matches a
 * transition phrase marks the start of the main content. Returns the
 * timestamp (seconds) of that line. Returns `null` when no transition is
 * detected (the whole transcript reads as setup, or the heuristic misses).
 */
export function estimateIntroLengthSeconds(
  lines: YOUTUBE_TRANSCRIPT_LINE[],
): number | null {
  for (const line of lines) {
    for (const pattern of TRANSITION_PATTERNS) {
      if (pattern.test(line.text)) {
        return (line.startMs ?? 0) / 1000;
      }
    }
  }
  return null;
}
