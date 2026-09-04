import { z } from "zod";

import { YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA } from "../../youtube/transcript/schemas";
import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_FIELD_DESCRIPTIONS,
  VIRAL_CLIPPER_GEMINI_MODEL,
} from "../constants";

/**
 * Shared by /diarize and /pipeline (root schemas.ts) — both must receive
 * exactly one media source to diarize.
 */
export const DIARIZE_SOURCE_FIELDS = {
  audioSource: z
    .string()
    .min(1)
    .optional()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.audioSource),
  videoUrl: z
    .string()
    .min(1)
    .optional()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.videoUrl),
  language: YOUTUBE_TRANSCRIPT_LANGUAGE_SCHEMA.describe(
    VIRAL_CLIPPER_FIELD_DESCRIPTIONS.language,
  ),
  model: z
    .string()
    .optional()
    .default(VIRAL_CLIPPER_GEMINI_MODEL.DEFAULT)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.model),
  speakerCount: z
    .number()
    .int()
    .min(2)
    .max(VIRAL_CLIPPER.MAX_CAPTION_SPEAKERS)
    .optional()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.speakerCount),
};

export function requireOneDiarizeSource<
  T extends { audioSource?: string; videoUrl?: string },
>(data: T, ctx: z.RefinementCtx): void {
  const hasAudio = Boolean(data.audioSource);
  const hasVideo = Boolean(data.videoUrl);
  if (hasAudio === hasVideo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Provide exactly one of audioSource or videoUrl",
      path: hasVideo ? ["audioSource"] : ["videoUrl"],
    });
  }
}

export const VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA = z
  .object(DIARIZE_SOURCE_FIELDS)
  .superRefine(requireOneDiarizeSource);

const DIARIZED_SEGMENT_SCHEMA = z.object({
  speaker: z.string(),
  start: z.string(),
  end: z.string(),
  text: z.string(),
});

/**
 * Dual-purpose: validates caller-supplied `diarized` request bodies
 * (/viral-moments, /cut) AND — passed as `generateStructuredContent`'s
 * `zodValidator` — Gemini's own parsed diarization response before
 * diarize/audio.ts trusts it. We were bitten once by a malformed response
 * (a segment silently missing `end`) that crashed deep downstream with a
 * cryptic error instead of failing clearly at the source; this catches
 * that class of problem immediately, whichever direction the data came
 * from. Lives here (not the root schemas.ts) because moments/cut schemas
 * import it — keeping it under diarize/ avoids a root ↔ moments import
 * cycle.
 */
export const DIARIZED_TRANSCRIPT_SCHEMA = z.object({
  speaker_count: z.number().int(),
  speakers: z.array(
    z.object({
      id: z.string(),
      guessed_identity: z.string().optional(),
      talk_time_seconds_estimate: z.number().optional(),
    }),
  ),
  segments: z.array(DIARIZED_SEGMENT_SCHEMA),
});

/** Gemini `responseSchema` (plain JSON Schema, not Zod) for the diarization call. */
export const GEMINI_DIARIZATION_RESPONSE_SCHEMA = {
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
          talk_time_seconds_estimate: { type: "number" },
        },
        required: ["id"],
      },
    },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          speaker: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          text: { type: "string" },
        },
        required: ["speaker", "start", "end", "text"],
      },
    },
  },
  required: ["speaker_count", "speakers", "segments"],
} as const;

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
