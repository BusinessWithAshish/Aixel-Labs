import { z } from "zod";

import { MEDIA_GEMINI_MODEL } from "../../media/constants";
import { YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA } from "../transcript/schemas";
import { YOUTUBE_DIARIZE_MAX_CAPTION_SPEAKERS } from "./constants";

/**
 * Captions only — no `audioSource` fallback here. Gemini-audio diarization
 * lives in `media` op=diarize; this op fails when there are no usable
 * captions rather than silently escalating to a paid call on your behalf.
 */
export const YOUTUBE_DIARIZE_REQUEST_SCHEMA = z.object({
  videoUrl: z
    .string()
    .min(1)
    .describe("YouTube watch/share URL or video id."),
  language: YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA.describe(
    "Caption language (BCP-47). Defaults to en.",
  ),
  model: z
    .string()
    .optional()
    .default(MEDIA_GEMINI_MODEL.DEFAULT)
    .describe(
      "Gemini model for the (cheap, text-only) speaker-labeling pass over already-split caption turns.",
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
