import { z } from "zod";

import { VIRAL_CLIPPER } from "./constants";
import { DIARIZE_SOURCE_FIELDS, requireOneDiarizeSource } from "./diarize/schemas";
import { CLIP_DURATION_BOUNDS_FIELDS, requireValidClipDurationRange } from "./moments/schemas";

/**
 * SSOT for the diarized-transcript shape — defined in diarize/schemas.ts
 * (where moments/ and cut/ import it from) and re-exported here for
 * importers that still expect it from the module root.
 */
export { DIARIZED_TRANSCRIPT_SCHEMA } from "./diarize/schemas";

export const VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA = z
  .object({
    ...DIARIZE_SOURCE_FIELDS,
    minCandidates: z.number().int().min(1).max(30).optional().default(
      VIRAL_CLIPPER.DEFAULT_MIN_CANDIDATES,
    ),
    maxCandidates: z.number().int().min(1).max(30).optional().default(
      VIRAL_CLIPPER.DEFAULT_MAX_CANDIDATES,
    ),
    ...CLIP_DURATION_BOUNDS_FIELDS,
  })
  .superRefine(requireOneDiarizeSource)
  .superRefine(requireValidClipDurationRange);
