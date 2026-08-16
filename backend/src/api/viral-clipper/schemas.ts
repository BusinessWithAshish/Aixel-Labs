import { z } from "zod";

import {
  VIRAL_CLIPPER,
  VIRAL_CLIPPER_ASPECT_RATIOS,
  VIRAL_CLIPPER_FIELD_DESCRIPTIONS,
  VIRAL_CLIPPER_GEMINI_MODEL,
  VIRAL_CLIPPER_YOUTUBE,
} from "./constants";

/** Shared by /viral-moments and /pipeline — both score candidate clip durations. */
const CLIP_DURATION_BOUNDS_FIELDS = {
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
function requireValidClipDurationRange<
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

export const VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA = z.object({
  blobUrl: z.string().url().describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.blobUrl),
  model: z
    .string()
    .optional()
    .default(VIRAL_CLIPPER_GEMINI_MODEL.DEFAULT)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.model),
});

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
 * diarize.ts trusts it. We were bitten once by a malformed response
 * (a segment silently missing `end`) that crashed deep downstream with a
 * cryptic error instead of failing clearly at the source; this catches
 * that class of problem immediately, whichever direction the data came
 * from.
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

const CLIP_RANGE_SCHEMA = z.object({
  start: z.string(),
  end: z.string(),
  label: z.string().optional(),
});

export const VIRAL_CLIPPER_CUT_REQUEST_SCHEMA = z.object({
  videoBlobUrl: z
    .string()
    .url()
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.videoBlobUrl),
  clips: z.array(CLIP_RANGE_SCHEMA).min(1).describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.clips),
  diarized: DIARIZED_TRANSCRIPT_SCHEMA.optional().describe(
    VIRAL_CLIPPER_FIELD_DESCRIPTIONS.diarizedForSnap,
  ),
  aspectRatio: z
    .enum(VIRAL_CLIPPER_ASPECT_RATIOS)
    .optional()
    .default(VIRAL_CLIPPER.DEFAULT_ASPECT_RATIO)
    .describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.aspectRatio),
});

export const VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA = z.object({
  videoUrl: z.string().url().describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.youtubeVideoUrl),
  maxComments: z
    .number()
    .int()
    .min(10)
    .max(1000)
    .optional()
    .default(VIRAL_CLIPPER_YOUTUBE.DEFAULT_MAX_COMMENTS),
});

export const VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA = z.object({
  videoUrl: z.string().url().describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.youtubeVideoUrl),
});

export const VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA = z
  .object({
    blobUrl: z.string().url().describe(VIRAL_CLIPPER_FIELD_DESCRIPTIONS.blobUrl),
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
 * `boundary-snap.ts` crashing on an unexpectedly-missing field) — same
 * rationale as DIARIZED_TRANSCRIPT_SCHEMA's dual use above.
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
