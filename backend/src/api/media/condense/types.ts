import type { z } from "zod";

import type { MEDIA_CONDENSE_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_CONDENSE_REQUEST = z.input<typeof MEDIA_CONDENSE_REQUEST_SCHEMA>;

export type MEDIA_CONDENSE_REQUEST_PARSED = z.output<typeof MEDIA_CONDENSE_REQUEST_SCHEMA>;

/**
 * A half-open time span in seconds, used for both "remove this" and "keep
 * this" throughout the module — `ranges.ts` converts between the two by
 * inverting against the source duration.
 */
export type TIME_RANGE = {
  start: number;
  end: number;
};

/** A removal, tagged with what put it there — used only for the summary counts. */
export type TAGGED_RANGE = TIME_RANGE & {
  reason: "silence" | "filler";
};

export type MEDIA_CONDENSE_RESPONSE = {
  /** Local filesystem path of the condensed file, under `MEDIA_CONDENSE_OUTPUT_DIR`. */
  mediaPath: string;
  /** "video" when the source has a video stream, "audio" when it doesn't — condense returns the same type it was given. */
  mediaType: "video" | "audio";
  sourceDurationSeconds: number;
  outputDurationSeconds: number;
  removedSeconds: number;
  /** Share of the source removed, 0-1. */
  removedFraction: number;
  cutCount: number;
  silenceCutCount: number;
  fillerCutCount: number;
  /**
   * Set when the removal list was truncated to `MEDIA_CONDENSE.MAX_CUT_RANGES` —
   * the longest removals were kept and this many shorter ones dropped.
   */
  droppedCutCount?: number;
};
