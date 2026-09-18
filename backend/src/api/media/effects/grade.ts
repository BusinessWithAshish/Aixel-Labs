import { MEDIA_EFFECTS, MEDIA_GRADE_PRESETS } from "../constants";
import type { GRADE_OPTIONS, MEDIA_GRADE_PRESET_NAME } from "./types";

/**
 * Resolve a grade request into the ordered ffmpeg filters that render it.
 *
 * A preset is a list of filters; the overrides are appended as ONE extra `eq`
 * (plus an `unsharp` when sharpening was asked for) rather than being merged
 * into the preset's own `eq`. Appending composes predictably — `eq` is
 * multiplicative on contrast/saturation and additive on brightness, so a
 * second pass scales the first rather than replacing values whose interaction
 * with the rest of the preset's chain nobody can hold in their head. It costs
 * nothing: ffmpeg fuses the chain into one pass over each frame either way.
 */
export function buildGradeFilters(grade: GRADE_OPTIONS): {
  preset: MEDIA_GRADE_PRESET_NAME;
  filters: string[];
} {
  const preset = (grade?.preset ?? MEDIA_EFFECTS.DEFAULT_PRESET) as MEDIA_GRADE_PRESET_NAME;
  const filters: string[] = [...MEDIA_GRADE_PRESETS[preset]];

  const eq: string[] = [];
  if (grade?.contrast !== undefined) eq.push(`contrast=${grade.contrast}`);
  if (grade?.brightness !== undefined) eq.push(`brightness=${grade.brightness}`);
  if (grade?.saturation !== undefined) eq.push(`saturation=${grade.saturation}`);
  if (grade?.gamma !== undefined) eq.push(`gamma=${grade.gamma}`);
  if (eq.length > 0) filters.push(`eq=${eq.join(":")}`);

  if (grade?.temperature !== undefined) {
    filters.push(`colortemperature=temperature=${grade.temperature}`);
  }
  if (grade?.sharpen !== undefined && grade.sharpen > 0) {
    filters.push(`unsharp=5:5:${grade.sharpen}:5:5:0.0`);
  }

  return { preset, filters };
}

/** The preset chains for every built-in look, in the order a preview sheet tiles them. */
export function everyPresetChain(): { name: MEDIA_GRADE_PRESET_NAME; filters: string[] }[] {
  return (Object.keys(MEDIA_GRADE_PRESETS) as MEDIA_GRADE_PRESET_NAME[]).map((name) => ({
    name,
    filters: [...MEDIA_GRADE_PRESETS[name]] as string[],
  }));
}
