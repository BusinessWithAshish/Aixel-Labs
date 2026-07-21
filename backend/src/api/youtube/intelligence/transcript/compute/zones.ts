import type { YOUTUBE_TRANSCRIPT_LINE } from "../../../transcript/types";
import {
  YOUTUBE_TRANSCRIPT_ZONE,
  YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES,
  YOUTUBE_TRANSCRIPT_ZONE_ORDER,
} from "../../constants";
import type {
  YOUTUBE_TRANSCRIPT_ZONE_TEXT,
  YOUTUBE_TRANSCRIPT_ZONE_VALUE,
} from "../types";

/** Returns the end time (seconds) of the last transcript line. */
export function computeTotalDurationSeconds(lines: YOUTUBE_TRANSCRIPT_LINE[]): number {
  if (lines.length === 0) return 0;
  let max = 0;
  for (const line of lines) {
    const start = (line.startMs ?? 0) / 1000;
    const dur = line.durationMs ?? 0;
    const end = start + dur / 1000;
    if (end > max) max = end;
  }
  return max;
}

/** Counts words in a text string. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

/** Returns the zone a given line midpoint (as a fraction of total duration) falls into. */
export function zoneForFraction(fraction: number): YOUTUBE_TRANSCRIPT_ZONE_VALUE {
  if (fraction < YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.INTRO_END) {
    return YOUTUBE_TRANSCRIPT_ZONE.INTRO;
  }
  if (fraction < YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.EARLY_END) {
    return YOUTUBE_TRANSCRIPT_ZONE.EARLY;
  }
  if (fraction < YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.MID_END) {
    return YOUTUBE_TRANSCRIPT_ZONE.MID;
  }
  return YOUTUBE_TRANSCRIPT_ZONE.OUTRO;
}

/** Divides lines into four zones based on each line's midpoint as a % of total duration. */
export function divideIntoZones(
  lines: YOUTUBE_TRANSCRIPT_LINE[],
  totalDurationSeconds: number,
): YOUTUBE_TRANSCRIPT_ZONE_TEXT[] {
  const buckets: Record<YOUTUBE_TRANSCRIPT_ZONE_VALUE, YOUTUBE_TRANSCRIPT_LINE[]> = {
    [YOUTUBE_TRANSCRIPT_ZONE.INTRO]: [],
    [YOUTUBE_TRANSCRIPT_ZONE.EARLY]: [],
    [YOUTUBE_TRANSCRIPT_ZONE.MID]: [],
    [YOUTUBE_TRANSCRIPT_ZONE.OUTRO]: [],
  };

  for (const line of lines) {
    const start = (line.startMs ?? 0) / 1000;
    const dur = (line.durationMs ?? 0) / 1000;
    const midpoint = totalDurationSeconds > 0 ? (start + dur / 2) / totalDurationSeconds : 0;
    const zone = zoneForFraction(midpoint);
    buckets[zone].push(line);
  }

  const zoneBoundaries: Record<YOUTUBE_TRANSCRIPT_ZONE_VALUE, { start: number; end: number }> = {
    [YOUTUBE_TRANSCRIPT_ZONE.INTRO]: { start: 0, end: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.INTRO_END * totalDurationSeconds },
    [YOUTUBE_TRANSCRIPT_ZONE.EARLY]: { start: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.INTRO_END * totalDurationSeconds, end: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.EARLY_END * totalDurationSeconds },
    [YOUTUBE_TRANSCRIPT_ZONE.MID]: { start: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.EARLY_END * totalDurationSeconds, end: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.MID_END * totalDurationSeconds },
    [YOUTUBE_TRANSCRIPT_ZONE.OUTRO]: { start: YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES.MID_END * totalDurationSeconds, end: totalDurationSeconds },
  };

  return YOUTUBE_TRANSCRIPT_ZONE_ORDER.map((zone) => {
    const linesInZone = buckets[zone];
    const text = linesInZone.map((l) => l.text).join(" ");
    const wordCount = countWords(text);
    const { start, end } = zoneBoundaries[zone];
    const zoneDurationMinutes = Math.max((end - start) / 60, 1 / 60);
    return {
      zone,
      text,
      wordCount,
      wordsPerMinute: wordCount > 0 ? Math.round(wordCount / zoneDurationMinutes) : null,
      startSeconds: start,
      endSeconds: end,
    };
  });
}

/** Computes words-per-minute across the full transcript. */
export function computeOverallWpm(totalWordCount: number, totalDurationSeconds: number): number | null {
  if (totalDurationSeconds <= 0) return null;
  const minutes = totalDurationSeconds / 60;
  if (minutes <= 0) return null;
  return Math.round(totalWordCount / minutes);
}
