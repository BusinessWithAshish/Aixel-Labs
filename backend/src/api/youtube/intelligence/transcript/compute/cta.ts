import type { YOUTUBE_TRANSCRIPT_LINE } from "../../../transcript/types";
import {
  YOUTUBE_TRANSCRIPT_CTA_POSITION,
  YOUTUBE_TRANSCRIPT_CTA_POSITION_BOUNDARIES,
  YOUTUBE_TRANSCRIPT_CTA_TYPE,
} from "../../constants";
import type {
  YOUTUBE_TRANSCRIPT_CTA,
  YOUTUBE_TRANSCRIPT_CTA_POSITION_VALUE,
  YOUTUBE_TRANSCRIPT_CTA_TYPE_VALUE,
} from "../types";

const CTA_PATTERNS: Array<{
  type: YOUTUBE_TRANSCRIPT_CTA_TYPE_VALUE;
  patterns: RegExp[];
}> = [
  {
    type: YOUTUBE_TRANSCRIPT_CTA_TYPE.SUBSCRIBE,
    patterns: [
      /\bsubscribe\b/i,
      /\bsubscribing\b/i,
      /\bsubscribes?\b/i,
      /\bhit (that|the) subscribe\b/i,
      /\bsubscribe (and|button|for)\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_CTA_TYPE.LIKE,
    patterns: [
      /\blike (this|the) video\b/i,
      /\bhit (that|the) like\b/i,
      /\bsmash (that|the) like\b/i,
      /\bthumbs up\b/i,
      /\bgive (it|this) a (like|thumbs)\b/i,
      /\bleave a like\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_CTA_TYPE.COMMENT,
    patterns: [
      /\bcomment below\b/i,
      /\bleave a comment\b/i,
      /\bdrop a comment\b/i,
      /\bput (it )?in the comments?\b/i,
      /\blet me know (down )?in the comments?\b/i,
      /\bcomments? section\b/i,
    ],
  },
  {
    type: YOUTUBE_TRANSCRIPT_CTA_TYPE.FOLLOW,
    patterns: [
      /\bfollow me\b/i,
      /\bfollow us\b/i,
      /\bfollow (me )?on\b/i,
      /\bfollow (my|our) (channel|page|account)\b/i,
    ],
  },
];

/** Maps a fraction-of-duration (0–1) to an early/mid/late position label. */
export function ctaPositionForFraction(
  fraction: number,
): YOUTUBE_TRANSCRIPT_CTA_POSITION_VALUE {
  if (fraction < YOUTUBE_TRANSCRIPT_CTA_POSITION_BOUNDARIES.EARLY_END) {
    return YOUTUBE_TRANSCRIPT_CTA_POSITION.EARLY;
  }
  if (fraction < YOUTUBE_TRANSCRIPT_CTA_POSITION_BOUNDARIES.LATE_START) {
    return YOUTUBE_TRANSCRIPT_CTA_POSITION.MID;
  }
  return YOUTUBE_TRANSCRIPT_CTA_POSITION.LATE;
}

/** Scans the transcript lines for CTA language and returns each match with its position. */
export function detectCtas(
  lines: YOUTUBE_TRANSCRIPT_LINE[],
  totalDurationSeconds: number,
): YOUTUBE_TRANSCRIPT_CTA[] {
  const ctas: YOUTUBE_TRANSCRIPT_CTA[] = [];
  const seen = new Set<string>(); // dedupe (type + snippet) to avoid spam
  for (const line of lines) {
    const startSeconds = (line.startMs ?? 0) / 1000;
    const fraction = totalDurationSeconds > 0 ? startSeconds / totalDurationSeconds : 0;
    for (const { type, patterns } of CTA_PATTERNS) {
      for (const pattern of patterns) {
        const match = line.text.match(pattern);
        if (!match) continue;
        const snippet = match[0];
        const key = `${type}|${snippet.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        ctas.push({
          type,
          position: ctaPositionForFraction(fraction),
          timestampSeconds: startSeconds,
          snippet,
        });
      }
    }
  }
  return ctas;
}
