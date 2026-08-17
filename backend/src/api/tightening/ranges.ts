import { TIGHTENING } from "./constants";
import type { TIME_RANGE } from "./types";

/**
 * The knob that decides whether the result sounds edited or sounds broken.
 *
 * A detected silence is NOT removed outright — it's shrunk from both ends by
 * `keepPaddingSeconds`, so a 2s pause becomes roughly `2 * keepPadding` of
 * retained breathing room instead of a hard splice between two words. Removing
 * the full span is what produces the machine-gunned, gasping-for-air sound
 * people associate with automatic silence cutting; leaving ~150ms at each edge
 * preserves the natural articulation gap around speech.
 *
 * Shrinking also means a silence barely over `minSilenceSeconds` reduces to
 * nothing and drops out via `MIN_REMOVAL_SECONDS` — which is correct: those are
 * the pauses that should survive untouched.
 */
export function shrinkSilences(
  silences: TIME_RANGE[],
  keepPaddingSeconds: number,
): TIME_RANGE[] {
  const result: TIME_RANGE[] = [];
  for (const { start, end } of silences) {
    const shrunkStart = start + keepPaddingSeconds;
    const shrunkEnd = end - keepPaddingSeconds;
    if (shrunkEnd - shrunkStart >= TIGHTENING.MIN_REMOVAL_SECONDS) {
      result.push({ start: shrunkStart, end: shrunkEnd });
    }
  }
  return result;
}

/**
 * Sorts and unions overlapping removals, additionally bridging any pair
 * separated by less than `BRIDGE_GAP_SECONDS`. Bridging matters because a
 * filler cut sitting just inside a silence cut would otherwise leave a
 * few-millisecond island of kept audio between them — inaudible as content,
 * audible as a click.
 */
export function mergeRanges(ranges: TIME_RANGE[]): TIME_RANGE[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: TIME_RANGE[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start - last.end <= TIGHTENING.BRIDGE_GAP_SECONDS) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Enforces `MAX_CUT_RANGES` by keeping the LONGEST removals and discarding the
 * rest. Degrading this way rather than erroring means a pathologically choppy
 * source still returns a usable video: the cuts that survive are the ones that
 * actually buy runtime, and the shortest ones — worth milliseconds each — are
 * the ones whose loss nobody notices. Returns the surviving ranges back in
 * chronological order.
 */
export function capRanges(ranges: TIME_RANGE[]): {
  ranges: TIME_RANGE[];
  droppedCount: number;
} {
  if (ranges.length <= TIGHTENING.MAX_CUT_RANGES) {
    return { ranges, droppedCount: 0 };
  }

  const kept = [...ranges]
    .sort((a, b) => b.end - b.start - (a.end - a.start))
    .slice(0, TIGHTENING.MAX_CUT_RANGES)
    .sort((a, b) => a.start - b.start);

  return { ranges: kept, droppedCount: ranges.length - TIGHTENING.MAX_CUT_RANGES };
}

/**
 * Turns a sorted, merged removal list into the complement — the spans to keep —
 * over `[0, durationSeconds]`. Zero removals yields a single whole-file range,
 * which is what keeps the render path uniform: the caller always assembles from
 * a keep-list and never needs a separate "nothing to do" branch.
 */
export function invertToKeepRanges(
  removals: TIME_RANGE[],
  durationSeconds: number,
): TIME_RANGE[] {
  const keeps: TIME_RANGE[] = [];
  let cursor = 0;

  for (const { start, end } of removals) {
    if (start > cursor) keeps.push({ start: cursor, end: Math.min(start, durationSeconds) });
    cursor = Math.max(cursor, end);
    if (cursor >= durationSeconds) break;
  }

  if (cursor < durationSeconds) keeps.push({ start: cursor, end: durationSeconds });

  return keeps.filter((range) => range.end > range.start);
}

export function totalDuration(ranges: TIME_RANGE[]): number {
  return ranges.reduce((sum, { start, end }) => sum + (end - start), 0);
}
