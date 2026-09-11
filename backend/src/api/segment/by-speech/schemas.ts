import { z } from "zod";

import { MEDIA } from "../../media/constants";
import { DIARIZED_TRANSCRIPT_SCHEMA } from "../../media/diarize/schemas";
import { MEDIA_FIELD_DESCRIPTIONS } from "../../media/constants";
import {
  CLIP_DURATION_BOUNDS_FIELDS,
  requireValidClipDurationRange,
} from "../moments/schemas";
import { SEGMENT_FIELD_DESCRIPTIONS, SEGMENT_PROVIDERS } from "../constants";

export const BY_SPEECH_REQUEST_SCHEMA = z
  .object({
    diarized: DIARIZED_TRANSCRIPT_SCHEMA.optional().describe(
      MEDIA_FIELD_DESCRIPTIONS.diarized,
    ),
    diarizedPath: z
      .string()
      .min(1)
      .optional()
      .describe(
        "The transcriptPath returned by youtube or media op=diarize. Prefer this over diarized: the transcript stays on the server instead of being re-sent through the model. Provide exactly one of diarized / diarizedPath.",
      ),
    provider: z.enum(SEGMENT_PROVIDERS).describe(SEGMENT_FIELD_DESCRIPTIONS.provider),
    model: z.string().optional().describe(SEGMENT_FIELD_DESCRIPTIONS.model),
    minCandidates: z.number().int().min(1).max(30).optional().default(
      MEDIA.DEFAULT_MIN_CANDIDATES,
    ),
    maxCandidates: z.number().int().min(1).max(30).optional().default(
      MEDIA.DEFAULT_MAX_CANDIDATES,
    ),
    ...CLIP_DURATION_BOUNDS_FIELDS,
  })
  .superRefine(requireValidClipDurationRange)
  .refine((v) => (v.diarized ? 1 : 0) + (v.diarizedPath ? 1 : 0) === 1, {
    message: "Provide exactly one of diarized or diarizedPath",
    path: ["diarizedPath"],
  });
