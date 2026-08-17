import type { z } from "zod";

import type { TIGHTENING_REQUEST_SCHEMA } from "./schemas";

export type TIGHTENING_REQUEST = z.input<typeof TIGHTENING_REQUEST_SCHEMA>;

export type TIGHTENING_REQUEST_PARSED = z.output<typeof TIGHTENING_REQUEST_SCHEMA>;

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

export type TIGHTENING_RESPONSE = {
  /** Local filesystem path of the tightened video, under `TIGHTENING_OUTPUT_DIR`. */
  videoPath: string;
  sourceDurationSeconds: number;
  outputDurationSeconds: number;
  removedSeconds: number;
  /** Share of the source removed, 0-1. */
  removedFraction: number;
  cutCount: number;
  silenceCutCount: number;
  fillerCutCount: number;
  /**
   * Set when the removal list was truncated to `TIGHTENING.MAX_CUT_RANGES` —
   * the longest removals were kept and this many shorter ones dropped.
   */
  droppedCutCount?: number;
};
