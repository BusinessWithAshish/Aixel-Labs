import { z } from "zod";

import {
  MEDIA_EFFECTS,
  MEDIA_FIELD_DESCRIPTIONS,
  MEDIA_GRADE_PRESET_NAMES,
  MEDIA_HIDE,
  MEDIA_HIDE_STYLES,
  MEDIA_LOGO,
  MEDIA_LOGO_POSITIONS,
} from "../constants";

const { GRADE_BOUNDS } = MEDIA_EFFECTS;

/** Bounds live in `MEDIA_EFFECTS.GRADE_BOUNDS` — see there for why they exist. */
const GRADE_SCHEMA = z
  .object({
    preset: z.enum(MEDIA_GRADE_PRESET_NAMES).optional(),
    /** `eq` multipliers/offsets, applied on top of the preset. */
    contrast: z.number().min(GRADE_BOUNDS.CONTRAST.MIN).max(GRADE_BOUNDS.CONTRAST.MAX).optional(),
    brightness: z
      .number()
      .min(GRADE_BOUNDS.BRIGHTNESS.MIN)
      .max(GRADE_BOUNDS.BRIGHTNESS.MAX)
      .optional(),
    saturation: z
      .number()
      .min(GRADE_BOUNDS.SATURATION.MIN)
      .max(GRADE_BOUNDS.SATURATION.MAX)
      .optional(),
    gamma: z.number().min(GRADE_BOUNDS.GAMMA.MIN).max(GRADE_BOUNDS.GAMMA.MAX).optional(),
    /** White balance in kelvin; below ~6500 warms, above cools. */
    temperature: z
      .number()
      .min(GRADE_BOUNDS.TEMPERATURE.MIN)
      .max(GRADE_BOUNDS.TEMPERATURE.MAX)
      .optional(),
    /** `unsharp` luma amount. 0 disables. */
    sharpen: z.number().min(GRADE_BOUNDS.SHARPEN.MIN).max(GRADE_BOUNDS.SHARPEN.MAX).optional(),
  })
  .strict();

const HIDE_REGION_SCHEMA = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

const HIDE_SCHEMA = z
  .object({
    /** `"auto"` detects burned-in overlays; a list covers exactly those rectangles. */
    regions: z.union([
      z.literal("auto"),
      z.array(HIDE_REGION_SCHEMA).min(1).max(MEDIA_HIDE.BOUNDS.MAX_REGIONS),
    ]),
    style: z.enum(MEDIA_HIDE_STYLES).optional(),
    /**
     * `style: "replace"` only — local path of the image to paste over the
     * region, scaled to fit inside it. Required for that style, ignored
     * otherwise.
     */
    replaceWith: z.string().min(1).optional(),
    /**
     * What sits behind a `replace` image: `"sampled"` (default) takes the
     * colour of the background around the region, so a mark with transparent
     * or awkward edges still lands on something that matches the footage.
     * An explicit `0xRRGGBB` overrides it.
     */
    backing: z
      .union([z.literal("sampled"), z.string().regex(/^0x[0-9a-fA-F]{6}$/)])
      .optional(),
    /**
     * `style: "replace"` only — make a flat background in `replaceWith`
     * transparent, so a JPEG avatar lands as its mark rather than as a square
     * sticker. `"auto"` samples that image's own top-left pixel.
     */
    keyColor: z
      .union([z.literal("auto"), z.string().regex(/^0x[0-9a-fA-F]{6}$/)])
      .optional(),
    /** Blur radius / pixel block as a fraction of the region's shorter side. */
    strength: z
      .number()
      .min(MEDIA_HIDE.BOUNDS.STRENGTH.MIN)
      .max(MEDIA_HIDE.BOUNDS.STRENGTH.MAX)
      .optional(),
  })
  .strict();

const LOGO_SCHEMA = z
  .object({
    /** Local path to the mark. PNG with alpha normally. */
    file: z.string().min(1),
    position: z.enum(MEDIA_LOGO_POSITIONS).optional(),
    /** Mark width as a fraction of the frame width. */
    scale: z.number().min(MEDIA_LOGO.BOUNDS.SCALE.MIN).max(MEDIA_LOGO.BOUNDS.SCALE.MAX).optional(),
    opacity: z
      .number()
      .min(MEDIA_LOGO.BOUNDS.OPACITY.MIN)
      .max(MEDIA_LOGO.BOUNDS.OPACITY.MAX)
      .optional(),
    /**
     * Make a flat background in the logo file transparent. `"auto"` samples the
     * image's own top-left pixel; an explicit `0xRRGGBB` keys that colour.
     * This is what lets a JPEG avatar double as the overlay mark without
     * shipping a second file with a real alpha channel.
     */
    keyColor: z
      .union([z.literal("auto"), z.string().regex(/^0x[0-9a-fA-F]{6}$/)])
      .optional(),
    /** Inset from the frame edges, as a fraction of frame width. */
    margin: z
      .number()
      .min(MEDIA_LOGO.BOUNDS.MARGIN.MIN)
      .max(MEDIA_LOGO.BOUNDS.MARGIN.MAX)
      .optional(),
  })
  .strict();

export const MEDIA_EFFECTS_REQUEST_SCHEMA = z
  .object({
    videoSource: z.string().min(1).describe(MEDIA_FIELD_DESCRIPTIONS.effectsVideoSource),
    grade: GRADE_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.effectsGrade),
    hide: HIDE_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.effectsHide),
    logo: LOGO_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.effectsLogo),
    preview: z.boolean().optional().default(false).describe(MEDIA_FIELD_DESCRIPTIONS.effectsPreview),
    at: z
      .array(z.number().nonnegative())
      .min(1)
      .max(MEDIA_EFFECTS.PREVIEW.MAX_FRAMES)
      .optional()
      .describe(MEDIA_FIELD_DESCRIPTIONS.effectsAt),
  })
  .strict();
