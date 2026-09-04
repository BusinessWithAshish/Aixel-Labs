import { z } from "zod";

import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_FIELD_DESCRIPTIONS,
  VIRAL_CLIPPER_GEMINI_MODEL,
} from "../constants";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "../diarize/schemas";

/** Shared by /viral-moments and /pipeline (root schemas.ts) — both score candidate clip durations. */
export const CLIP_DURATION_BOUNDS_FIELDS = {
  minClipSeconds: z
    .number()
    .int()
    .min(VIRAL_CLIPPER.MIN_CLIP_SECONDS)
    .max(VIRAL_CLIPPER.MAX_CLIP_SECONDS)
    .optional()
    .default(VIRAL_CLIPPER.DEFAULT_MIN_CLIP_SECONDS)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.minClipSeconds),
  maxClipSeconds: z
    .number()
    .int()
    .min(VIRAL_CLIPPER.MIN_CLIP_SECONDS)
    .max(VIRAL_CLIPPER.MAX_CLIP_SECONDS)
    .optional()
    .default(VIRAL_CLIPPER.DEFAULT_MAX_CLIP_SECONDS)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.maxClipSeconds),
  channelContext: z
    .string()
    .max(2000)
    .optional()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.channelContext),
  audienceSignals: z
    .array(z.string())
    .max(50)
    .optional()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.audienceSignals),
};

/** minClipSeconds must not exceed maxClipSeconds — applied after defaults via .refine on the object. */
export function requireValidClipDurationRange<
  T extends { minClipSeconds: number; maxClipSeconds: number },
>(data: T, ctx: z.RefinementCtx): void {
  if (data.minClipSeconds > data.maxClipSeconds) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "minClipSeconds must be <= maxClipSeconds",
      path: ["minClipSeconds"],
    });
  }
}

export const VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA = z
  .object({
    diarized: DIARIZED_TRANSCRIPT_SCHEMA.describe(
      VIRAL_CLIPPER_FIELD_DESCRIPTIONS.diarized,
    ),
    model: z
      .string()
      .optional()
      .default(VIRAL_CLIPPER_GEMINI_MODEL.DEFAULT)
      .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.model),
    minCandidates: z.number().int().min(1).max(30).optional().default(
      VIRAL_CLIPPER.DEFAULT_MIN_CANDIDATES,
    ),
    maxCandidates: z.number().int().min(1).max(30).optional().default(
      VIRAL_CLIPPER.DEFAULT_MAX_CANDIDATES,
    ),
    ...CLIP_DURATION_BOUNDS_FIELDS,
  })
  .superRefine(requireValidClipDurationRange);

/** Gemini `responseSchema` for the viral-moment scoring call. */
export const GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rank: { type: "integer" },
          start: { type: "string" },
          end: { type: "string" },
          duration_seconds_estimate: { type: "integer" },
          hook_type: {
            type: "string",
            enum: [
              "emotional_peak",
              "quotable_line",
              "topic_conflict",
              "story_payoff",
              "surprising_claim",
              "humor",
              "vulnerable_moment",
              "actionable_advice",
            ],
          },
          score: { type: "integer" },
          suggested_title: { type: "string" },
          why_it_works: { type: "string" },
          standalone_check: { type: "string" },
          hook_line: { type: "string" },
          ending_note: { type: "string" },
          has_audible_laughter: { type: "boolean" },
        },
        required: [
          "rank",
          "start",
          "end",
          "hook_type",
          "score",
          "suggested_title",
          "why_it_works",
          "standalone_check",
          "hook_line",
          "ending_note",
          "has_audible_laughter",
        ],
      },
    },
    podcast_tone: {
      type: "string",
      enum: ["comedy", "informative", "mixed"],
    },
    podcast_tone_note: { type: "string" },
  },
  required: ["candidates", "podcast_tone", "podcast_tone_note"],
} as const;

/**
 * Zod mirror of GEMINI_VIRAL_MOMENTS_RESPONSE_SCHEMA above, used as
 * `generateStructuredContent`'s `zodValidator` so a malformed response
 * fails clearly at the point Gemini returned it, not deep downstream (e.g.
 * `cut/boundary-snap.ts` crashing on an unexpectedly-missing field) — same
 * rationale as DIARIZED_TRANSCRIPT_SCHEMA's dual use.
 */
export const GEMINI_VIRAL_MOMENTS_RESPONSE_VALIDATOR = z.object({
  candidates: z.array(
    z.object({
      rank: z.number(),
      start: z.string(),
      end: z.string(),
      duration_seconds_estimate: z.number().optional(),
      hook_type: z.enum([
        "emotional_peak",
        "quotable_line",
        "topic_conflict",
        "story_payoff",
        "surprising_claim",
        "humor",
        "vulnerable_moment",
        "actionable_advice",
      ]),
      score: z.number(),
      suggested_title: z.string(),
      why_it_works: z.string(),
      standalone_check: z.string(),
      hook_line: z.string(),
      ending_note: z.string(),
      has_audible_laughter: z.boolean(),
    }),
  ),
  podcast_tone: z.enum(["comedy", "informative", "mixed"]),
  podcast_tone_note: z.string(),
});
