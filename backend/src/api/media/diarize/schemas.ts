import { z } from "zod";

import { MEDIA_FIELD_DESCRIPTIONS, MEDIA_GEMINI_MODEL } from "../constants";

/**
 * Gemini-audio only — this op no longer takes a `videoUrl`. Reading YouTube's
 * own captions is a `youtube` domain capability now (`youtube` op=`diarize`,
 * see `api/youtube/diarize/`); this op never touches YouTube at all, and a
 * YouTube link passed here is just a URL `resolveMediaSource` will (correctly)
 * fail to download as media bytes.
 */
export const MEDIA_DIARIZE_REQUEST_SCHEMA = z.object({
  mediaSource: z.string().min(1).describe(MEDIA_FIELD_DESCRIPTIONS.mediaSource),
  model: z
    .string()
    .optional()
    .default(MEDIA_GEMINI_MODEL.DEFAULT)
    .describe(MEDIA_FIELD_DESCRIPTIONS.model),
  includeTranscript: z
    .boolean()
    .optional()
    .describe(
      "false: return transcriptPath + a summary instead of the full transcript inline. Use it whenever the transcript goes on to segment op=by_speech (pass the path as diarizedPath) — a long episode's transcript is tens of thousands of tokens. The file is written either way. Default true.",
    ),
});

const DIARIZED_SEGMENT_SCHEMA = z.object({
  speaker: z.string(),
  start: z.string(),
  end: z.string(),
  text: z.string(),
});

/**
 * Dual-purpose: validates caller-supplied `diarized` request bodies
 * (the moments scorer, /media/cut) AND — passed as `generateStructuredContent`'s
 * `zodValidator` — Gemini's own parsed diarization response before
 * diarize/audio.ts trusts it. We were bitten once by a malformed response
 * (a segment silently missing `end`) that crashed deep downstream with a
 * cryptic error instead of failing clearly at the source; this catches
 * that class of problem immediately, whichever direction the data came
 * from. Lives here (not the root constants.ts) because moments/cut schemas
 * import it — keeping it under diarize/ avoids a root ↔ moments import
 * cycle.
 *
 * This is the ONE shape both `media.diarize` (Gemini audio) and
 * `youtube.diarize` (captions) produce — the shared contract that lets
 * `segment.by_speech`/`media.cut` accept either without caring which one ran.
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

/** Gemini `responseSchema` (plain JSON Schema, not Zod) for the audio diarization call. */
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
