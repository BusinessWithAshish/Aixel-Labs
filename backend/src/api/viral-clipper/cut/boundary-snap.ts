import { VIRAL_CLIPPER } from "../constants";
import type { DIARIZED_TRANSCRIPT } from "../types";

/** Parses "MM:SS" or "HH:MM:SS" into seconds. */
export function parseTimestampToSeconds(timestamp: string): number {
  const parts = timestamp.split(":").map(Number);
  if (parts.some((p) => Number.isNaN(p))) return 0;
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const [m, s] = parts;
    return m * 60 + s;
  }
  return parts[0] ?? 0;
}

export type SnappedRange = {
  cutStartSeconds: number;
  cutEndSeconds: number;
  snapped: boolean;
};

/**
 * Snaps a requested {start, end} to the nearest real speech-segment boundary
 * in the diarized transcript when that boundary is close enough to be a
 * cheap, safe adjustment — never far enough to meaningfully change what the
 * clip contains. Falls back to the raw requested timestamp + fixed padding
 * otherwise. See `constants.ts` -> `BOUNDARY_SNAP_MAX_DISTANCE_SECONDS` for
 * why this is a best-effort reduction of mid-word cuts, not a guarantee —
 * diarization segments are speaker-turn-level, not word-level.
 */
export function snapClipBoundaries(
  requestedStart: string,
  requestedEnd: string,
  diarized: DIARIZED_TRANSCRIPT | undefined,
  sourceDurationSeconds?: number,
): SnappedRange {
  const rawStart = parseTimestampToSeconds(requestedStart);
  const rawEnd = parseTimestampToSeconds(requestedEnd);

  let snapped = false;
  let start = rawStart;
  let end = rawEnd;

  if (diarized && diarized.segments.length > 0) {
    const segments = diarized.segments.map((s) => ({
      start: parseTimestampToSeconds(s.start),
      end: parseTimestampToSeconds(s.end),
    }));

    // Start: only ever snap BACKWARD (to a segment start at/before rawStart)
    // — snapping forward would silently drop content the caller asked for.
    const containingStart = segments.find(
      (s) => rawStart > s.start && rawStart < s.end,
    );
    if (containingStart && rawStart - containingStart.start <= VIRAL_CLIPPER.BOUNDARY_SNAP_MAX_DISTANCE_SECONDS) {
      start = containingStart.start;
      snapped = true;
    }

    // End: only ever snap FORWARD (to a segment end at/after rawEnd) — the
    // same asymmetry, so we never truncate wanted content either.
    const containingEnd = segments.find((s) => rawEnd > s.start && rawEnd < s.end);
    if (containingEnd && containingEnd.end - rawEnd <= VIRAL_CLIPPER.BOUNDARY_SNAP_MAX_DISTANCE_SECONDS) {
      end = containingEnd.end;
      snapped = true;
    }
  }

  start = Math.max(0, start - VIRAL_CLIPPER.CLIP_PADDING_SECONDS);
  end = end + VIRAL_CLIPPER.CLIP_PADDING_SECONDS;
  if (sourceDurationSeconds !== undefined) {
    end = Math.min(end, sourceDurationSeconds);
  }

  return { cutStartSeconds: start, cutEndSeconds: end, snapped };
}
