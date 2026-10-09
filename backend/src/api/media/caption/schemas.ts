import { z } from "zod";

import {
  MEDIA_CAPTION,
  MEDIA_CAPTION_POSITIONS,
  MEDIA_CAPTION_PRESETS,
  MEDIA_CAPTION_SCRIPTS,
  MEDIA_FIELD_DESCRIPTIONS,
} from "../constants";
import { MEDIA_TRANSCRIBE_MODEL } from "../transcribe/constants";

const HEX_COLOUR = z
  .string()
  .regex(/^#?[0-9a-fA-F]{6}$/, "expected a 6-digit hex colour like #FFFFFF")
  .transform((v) => (v.startsWith("#") ? v : `#${v}`));

const CAPTION_STYLE_SCHEMA = z
  .object({
    /** `lines` (default): sentence cues. `chunks`: 1–3 words at a time, spoken word highlighted. */
    preset: z.enum(MEDIA_CAPTION_PRESETS).optional(),
    fontName: z.string().min(1).optional(),
    fontSize: z
      .number()
      .min(MEDIA_CAPTION.MIN_FONT_SIZE)
      .max(MEDIA_CAPTION.MAX_FONT_SIZE)
      .optional(),
    primaryColour: HEX_COLOUR.optional(),
    /** `chunks` only: colour of the word being spoken. */
    highlightColour: HEX_COLOUR.optional(),
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
  script: z
    .enum(MEDIA_CAPTION_SCRIPTS)
    .optional()
    .default("native")
    .describe(MEDIA_FIELD_DESCRIPTIONS.captionScript),
  style: CAPTION_STYLE_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.captionStyle),
  wrap: CAPTION_WRAP_SCHEMA.optional().describe(MEDIA_FIELD_DESCRIPTIONS.captionWrap),
  burn: z.boolean().optional().default(true).describe(MEDIA_FIELD_DESCRIPTIONS.captionBurn),
  /**
   * `"gemini"`: a second listener (Gemini, on the clip's own audio, no language
   * forced) decides the words and Whisper only times them — see `listen.ts`.
   * For speech Whisper mishears: code-switched Hindi/English, Punjabi and other
   * accents, fast talk. `"none"` (default) is Whisper alone, as before.
   */
  listener: z
    .enum(["none", "gemini", "verified"])
    .optional()
    .default("none")
    .describe(
      "'gemini' has a second listener decide the caption WORDS (verbatim, Roman script, no language forced) while Whisper only supplies their timing — use it for Indian-language, mixed-language or heavily accented speech, where Whisper alone writes the wrong words or drops whole stretches. Falls back to Whisper alone if the listener is unavailable, and says so in `listener`/`listenerFallbackReason`. 'verified' is the robust one: the same listener, plus a second Whisper pass in the other language and Claude as judge whenever the listener is unavailable or disagrees with Whisper about much of the clip — so a busy listener no longer means wrong captions. 'none' (default) is Whisper alone.",
    ),
  maskProfanity: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "true shows swear words as their first and last letter with stars between ('f*****g'), English and Hindi/Punjabi, same length as the word. Only what is written on screen changes; the audio is untouched.",
    ),
});

/** Gemini `responseSchema` for `script: "roman"`: numbered words in, the same numbers back — see `transliterate.ts`. */
export const GEMINI_CAPTION_ROMANIZE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    words: {
      type: "array",
      items: {
        type: "object",
        properties: { i: { type: "integer" }, roman: { type: "string" } },
        required: ["i", "roman"],
      },
    },
  },
  required: ["words"],
};

/** What Gemini actually returned for the schema above. */
export const CAPTION_ROMANIZE_VALIDATOR = z.object({
  words: z.array(z.object({ i: z.number().int(), roman: z.string() })),
});
