import { z } from "zod";

import { YOUTUBE_GEO_REQUEST_SCHEMA } from "../schemas";
import { YOUTUBE_HANDLE_CHECK_MAX_BATCH } from "../constants";

/**
 * Candidate handles are accepted loosely (any non-empty string, with or
 * without a leading `@`) so the checker can *report* validity per candidate
 * rather than reject the whole batch — the point is idea-checking.
 */
export const YOUTUBE_HANDLE_CHECK_REQUEST_SCHEMA = YOUTUBE_GEO_REQUEST_SCHEMA.extend({
  handles: z
    .array(z.string().min(1).max(120))
    .min(1)
    .max(YOUTUBE_HANDLE_CHECK_MAX_BATCH)
    .describe(
      `Candidate channel handles to check, with or without a leading @ (max ${YOUTUBE_HANDLE_CHECK_MAX_BATCH}). Each is checked for YouTube format validity and, if valid, live availability.`,
    ),
});
