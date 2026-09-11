import { z } from "zod";

import {
  MEDIA_CAPTION,
  MEDIA_CAPTION_POSITIONS,
  MEDIA_FIELD_DESCRIPTIONS,
} from "../constants";
import { MEDIA_TRANSCRIBE_MODEL } from "../transcribe/constants";

const HEX_COLOUR = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, "expected a 6-digit hex colour like #FFFFFF")
  .transform((v) => (v.startsWith("#") ? v : `#${v}`));

const CAPTION_STYLE_SCHEMA = z
  .object({
    fontName: z.string().min(1).optional(),
    fontSize: z
      .number()
      .min(MEDIA_CAPTION.MIN_FONT_SIZE)
      .max(MEDIA_CAPTION.MAX_FONT_SIZE)
      .optional(),
    primaryColour: HEX_COLOUR.optional(),
    outlineColour: HEX_COLOUR.optional(),
    outline: z.number().min(0).max(20).optional(),
    shadow: z.number().min(0).max(20).optional(),
    bold: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    position: z.enum(MEDIA_CAPTION_POSITIONS).optional(),
    /** Explicit vertical margin in SOURCE PIXELS; overrides the position default. */
    marginV: z.number().min(0).max(2000).optional(),
  })
  .strict();

const CAPTION_WRAP_SCHEMA = z
  .object({
    maxCharsPerLine: z
      .number()
      .int()
      .min(MEDIA_CAPTION.MIN_CHARS_PER_LINE)
      .max(MEDIA_CAPTION.MAX_CHARS_PER_LINE)
      .optional(),
    maxLinesPerCue: z
      .number()
      .int()
      .min(1)
      .max(MEDIA_CAPTION.MAX_LINES_PER_CUE)
      .optional(),
  })
  .strict();

export const MEDIA_CAPTION_REQUEST_SCHEMA = z.object({
  videoSource: z
    .string()
    .min(1)
    .describe(MEDIA_FIELD_DESCRIPTIONS.captionVideoSource),
  subtitles: z.string().min(1).optional().describe(MEDIA_FIELD_DESCRIPTIONS.captionSubtitles),
  language: z.string().trim().min(2).max(5).optional(),
  model: z
    .enum([MEDIA_TRANSCRIBE_MODEL.TURBO, MEDIA_TRANSCRIBE_MODEL.LARGE])
    .optional()
    .default(MEDIA_TRANSCRIBE_MODEL.TURBO),
  style: CAPTION_STYLE_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.captionStyle),
  wrap: CAPTION_WRAP_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.captionWrap),
  burn: z.boolean().optional().default(true).describe(MEDIA_FIELD_DESCRIPTIONS.captionBurn),
});
