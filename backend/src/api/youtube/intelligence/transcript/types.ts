import type { WithIntelligence } from "../types";
import {
  YOUTUBE_TRANSCRIPT_CTA_POSITION,
  YOUTUBE_TRANSCRIPT_CTA_TYPE,
  YOUTUBE_TRANSCRIPT_HOOK_TYPE,
  YOUTUBE_TRANSCRIPT_ZONE,
} from "../constants";
import type { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST } from "./schemas";

export type { YOUTUBE_TRANSCRIPT_INTELLIGENCE_REQUEST };

// ─── Intelligence field types ──────────────────────────────────────────────────

export type YOUTUBE_TRANSCRIPT_ZONE_VALUE =
  (typeof YOUTUBE_TRANSCRIPT_ZONE)[keyof typeof YOUTUBE_TRANSCRIPT_ZONE];

export type YOUTUBE_TRANSCRIPT_HOOK_TYPE_VALUE =
  (typeof YOUTUBE_TRANSCRIPT_HOOK_TYPE)[keyof typeof YOUTUBE_TRANSCRIPT_HOOK_TYPE];

export type YOUTUBE_TRANSCRIPT_CTA_TYPE_VALUE =
  (typeof YOUTUBE_TRANSCRIPT_CTA_TYPE)[keyof typeof YOUTUBE_TRANSCRIPT_CTA_TYPE];

export type YOUTUBE_TRANSCRIPT_CTA_POSITION_VALUE =
  (typeof YOUTUBE_TRANSCRIPT_CTA_POSITION)[keyof typeof YOUTUBE_TRANSCRIPT_CTA_POSITION];

/** Raw text + timing for a single transcript zone. */
export type YOUTUBE_TRANSCRIPT_ZONE_TEXT = {
  zone: YOUTUBE_TRANSCRIPT_ZONE_VALUE;
  /** Concatenated text of all lines whose midpoint falls in this zone. */
  text: string;
  /** Number of words in this zone. */
  wordCount: number;
  /** Words per minute within this zone. */
  wordsPerMinute: number | null;
  /** Start time of the zone, in seconds. */
  startSeconds: number;
  /** End time of the zone, in seconds. */
  endSeconds: number;
};

/** A detected call-to-action in the transcript. */
export type YOUTUBE_TRANSCRIPT_CTA = {
  type: YOUTUBE_TRANSCRIPT_CTA_TYPE_VALUE;
  /** Approximate position as a fraction of total duration (early / mid / late). */
  position: YOUTUBE_TRANSCRIPT_CTA_POSITION_VALUE;
  /** Timestamp in seconds where the CTA was detected. */
  timestampSeconds: number;
  /** The matched text snippet that triggered the detection. */
  snippet: string;
};

/** A keyword frequency entry from the transcript. */
export type YOUTUBE_TRANSCRIPT_KEYWORD = {
  term: string;
  frequency: number;
};

export type YOUTUBE_TRANSCRIPT_INTELLIGENCE_FIELDS = {
  /** Total word count across the full transcript. */
  totalWordCount: number;
  /** Total duration in seconds (last line end time). */
  totalDurationSeconds: number;
  /** Words per minute across the full transcript. */
  wordsPerMinute: number | null;
  /** Words per minute within the intro zone specifically. */
  introWordsPerMinute: number | null;
  /** Per-zone raw text + pacing. */
  zones: YOUTUBE_TRANSCRIPT_ZONE_TEXT[];
  /** Classified hook type of the intro zone. */
  hookType: YOUTUBE_TRANSCRIPT_HOOK_TYPE_VALUE;
  /** Detected calls-to-action. */
  ctas: YOUTUBE_TRANSCRIPT_CTA[];
  /** Top 30 most frequent meaningful terms (stop words excluded). */
  keywords: YOUTUBE_TRANSCRIPT_KEYWORD[];
  /**
   * Title alignment score (0–1). `null` when no title was provided.
   * 1 = title keywords well represented in the transcript (especially the intro).
   * 0 = title and content fully misaligned.
   */
  titleAlignmentScore: number | null;
  /**
   * Estimated seconds before the main content begins (transition from setup
   * / hook language into substantive content). Approximation based on text patterns.
   */
  introLengthSeconds: number | null;
};

export type YOUTUBE_TRANSCRIPT_INTELLIGENCE_RESPONSE = {
  videoId: string;
  language: string;
  /** The video title if one was provided in the request. */
  title: string | null;
  /** Per-zone text + pacing. */
  zones: YOUTUBE_TRANSCRIPT_ZONE_TEXT[];
  /** Computed intelligence fields. */
  intelligence: YOUTUBE_TRANSCRIPT_INTELLIGENCE_FIELDS;
};

export type WithTranscriptIntelligence = WithIntelligence<
  { videoId: string; language: string },
  YOUTUBE_TRANSCRIPT_INTELLIGENCE_FIELDS
>;
