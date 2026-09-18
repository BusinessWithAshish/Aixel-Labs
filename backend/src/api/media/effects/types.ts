import type { z } from "zod";

import type {
  MEDIA_GRADE_PRESET_NAMES,
  MEDIA_HIDE_STYLES,
  MEDIA_LOGO_POSITIONS,
} from "../constants";
import type { MEDIA_EFFECTS_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_GRADE_PRESET_NAME = (typeof MEDIA_GRADE_PRESET_NAMES)[number];
export type HIDE_STYLE = (typeof MEDIA_HIDE_STYLES)[number];
export type LOGO_POSITION = (typeof MEDIA_LOGO_POSITIONS)[number];

export type MEDIA_EFFECTS_REQUEST_PARSED = z.infer<typeof MEDIA_EFFECTS_REQUEST_SCHEMA>;

export type GRADE_OPTIONS = MEDIA_EFFECTS_REQUEST_PARSED["grade"];
export type LOGO_OPTIONS = NonNullable<MEDIA_EFFECTS_REQUEST_PARSED["logo"]> & {
  /** Resolved `0xRRGGBB` to key out, after `keyColor: "auto"` has been sampled. */
  keyedColour?: string;
};

/** The background colour immediately around a region, and whether it is safe to paint with it. */
export type SURROUND_COLOUR = {
  /** `0xRRGGBB`, ready for drawbox. */
  hex: string;
  rgb: [number, number, number];
  /** Per-channel colour variation WITHIN a frame. Diagnostic only — see `consensus`. */
  spread: number;
  /** Share of sampled pixels that match the colour we would paint. This is what decides. */
  consensus: number;
  /** Movement of the colour ACROSS frames. Low = stable background. */
  drift: number;
  samples: number;
  /** Both measurements inside their limits — a flat patch will be invisible. */
  uniform: boolean;
};

/** One region and how it will actually be covered, after any fallback. */
export type COVER_PLAN = {
  region: HIDE_REGION;
  style: HIDE_STYLE;
  /** `fill`, and the backing behind `replace`: the `0xRRGGBB` sampled from around the region. */
  colour?: string;
  /** `replace` only: local path of the image pasted over the region. */
  replaceWith?: string;
  /** `replace` only: resolved `0xRRGGBB` keyed out of that image, if any. */
  replaceKeyColour?: string;
  strength: number;
  surround?: SURROUND_COLOUR;
  fellBackFrom?: HIDE_STYLE;
};

/** A rectangle in SOURCE pixels. */
export type HIDE_REGION = { x: number; y: number; width: number; height: number };

export type DETECTED_REGION = HIDE_REGION & {
  /** 0-1. Below MEDIA_HIDE.DETECT.MIN_CONFIDENCE the region is reported but not covered. */
  confidence: number;
  /** How still the region was across the sampled frames. */
  staticness: number;
  /** How much hard-edged detail it holds — what separates a graphic from a flat wall. */
  structure: number;
};

/** One contact sheet: every preset applied to the same frame, tiled and labelled. */
export type EFFECTS_PREVIEW_SHEET = {
  atSeconds: number;
  sheetPath: string;
};

export type MEDIA_EFFECTS_RESPONSE = {
  /** The treated video. Absent on a preview call — a preview renders no video. */
  outputPath?: string;
  /** One sheet per requested timestamp. Absent on a render call. */
  previews?: EFFECTS_PREVIEW_SHEET[];
  /**
   * Tile order on every sheet, left to right then top to bottom, so a sheet
   * read on a phone maps back to a preset name without counting.
   */
  tileOrder?: string[];
  /** What was actually applied, after preset + overrides were resolved. */
  applied?: { preset: MEDIA_GRADE_PRESET_NAME; filters: string[] };
  hide?: {
    /** The regions actually covered, in source pixels. */
    regions: HIDE_REGION[];
    style: HIDE_STYLE;
    /** Per region: the style actually used, and for `fill`, the colour and why it was or wasn't safe. */
    covers?: {
      region: HIDE_REGION;
      style: HIDE_STYLE;
      surround?: SURROUND_COLOUR;
      /** Set when `fill` was asked for but the background was not flat enough. */
      fellBackFrom?: HIDE_STYLE;
    }[];
    /** Auto-detect only: everything found, including regions left uncovered for low confidence. */
    detected?: DETECTED_REGION[];
    /** Auto-detect only: a still with every detected region outlined. Check this before trusting a run. */
    proofPath?: string;
    /** Set when detection ran and found nothing — the clip is rendered untouched by `hide`. */
    note?: string;
  };
  logo?: { file: string; position: LOGO_POSITION; widthPixels: number; keyed?: string };
  durationSeconds: number;
  width?: number;
  height?: number;
};
