import { z } from "zod";

import { YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA } from "../transcript/schemas";
import { YOUTUBE_DIARIZE_MAX_CAPTION_SPEAKERS } from "./constants";
import { CHANNEL_FIELD } from "../../../channel-keys";

/**
 * Captions only — no `mediaSource` fallback here. Gemini-audio diarization
 * lives in `media` op=diarize; this op fails when there are no usable
 * captions rather than silently escalating to a paid call on your behalf.
 *
 * The model call this op makes is small — label already-split turns with
 * speaker ids, no audio, no judgment about content — so `provider` has a
 * default rather than being required like `segment.by_speech`'s. It defaults
 * to `groq`, off the Gemini free-tier pool: that pool is spent by the
 * audio-shaped work first, and this call was seen failing on both 429 (daily
 * quota) and 503 (model overloaded), only the first of which more keys fix.
 * `gemini` and `claude` remain for when you want schema-constrained decoding
 * or Claude's labeling specifically.
 */
export const YOUTUBE_DIARIZE_REQUEST_SCHEMA = z.object({
  videoUrl: z
    .string()
    .min(1)
    .describe("YouTube watch/share URL or video id."),
  language: YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA.describe(
    "Caption language (BCP-47). Defaults to en.",
  ),
  provider: z
    .enum(["groq", "gemini", "claude"])
    .optional()
    .default("groq")
    .describe(
      "Which AI backend runs the (cheap, text-only) speaker-labeling pass over already-split caption turns. 'groq' (default) — the Groq key this project already holds for Whisper, a separate quota from Gemini's, JSON-mode output validated against the schema; its free tier caps one request at 8k tokens, so a long episode's turn list falls back to Claude automatically (then Gemini, only if Claude is unavailable) and `usage.provider` reports which one ran. 'gemini' — free-tier key pool, real schema-constrained output; shared with diarization and moment scoring, so it is the first thing to run dry. 'claude' — local Claude Code subscription (flat-rate, shares the org-wide 40-session/day delegation budget), validated + retried on a malformed response.",
    ),
  model: z
    .string()
    .optional()
    .describe(
      "Optional model override, passed to whichever provider is chosen. Omit to use that provider's own default.",
    ),
  speakerCount: z
    .number()
    .int()
    .min(2)
    .max(YOUTUBE_DIARIZE_MAX_CAPTION_SPEAKERS)
    .optional()
    .describe(
      "Optional hint for how many distinct people are talking (2-8). Omit to let the model infer.",
    ),
  includeTranscript: z
    .boolean()
    .optional()
    .describe(
      "false: return transcriptPath + a summary instead of the full transcript inline. Use it whenever the transcript goes on to segment op=by_speech (pass the path as diarizedPath) — a long episode's transcript is tens of thousands of tokens. The file is written either way. Default true.",
    ),
  channel: CHANNEL_FIELD,
});


/** Gemini `responseSchema` for caption-turn speaker labeling (no audio). */
export const GEMINI_CAPTION_SPEAKER_LABEL_SCHEMA = {
  type: "object",
  properties: {
    speaker_count: { type: "integer" },
    speakers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          guessed_identity: { type: "string" },
        },
        required: ["id"],
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer" },
          speaker: { type: "string" },
        },
        required: ["i", "speaker"],
      },
    },
  },
  required: ["speaker_count", "speakers", "assignments"],
} as const;

export const GEMINI_CAPTION_SPEAKER_LABEL_VALIDATOR = z.object({
  speaker_count: z.number().int(),
  speakers: z.array(
    z.object({
      id: z.string(),
      guessed_identity: z.string().optional(),
    }),
  ),
  assignments: z.array(
    z.object({
      i: z.number().int(),
      speaker: z.string(),
    }),
  ),
});
