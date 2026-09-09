import type { z } from "zod";

import type { GEMINI_USAGE_METADATA } from "../media/types";
import type { CLAUDE_USAGE } from "../claude/types";
import type { MOMENTS_PODCAST_TONE, VIRAL_MOMENT_CANDIDATE } from "./moments/types";
import type { BY_SPEECH_REQUEST_SCHEMA } from "./by-speech/schemas";

export type BY_SPEECH_REQUEST = z.input<typeof BY_SPEECH_REQUEST_SCHEMA>;
export type BY_SPEECH_REQUEST_PARSED = z.output<typeof BY_SPEECH_REQUEST_SCHEMA>;

/**
 * Provider-tagged usage — the two providers report fundamentally different
 * shapes (Gemini's token-count metadata vs. Claude CLI's usage block), and
 * collapsing them into one normalized shape would either lose fields or
 * invent an average that means nothing. `provider` is a discriminant: check
 * it before reading the rest.
 */
export type SEGMENT_USAGE =
  | { provider: "gemini"; usage: GEMINI_USAGE_METADATA }
  | { provider: "claude"; usage: CLAUDE_USAGE | undefined; attempts: number };

export type BY_SPEECH_RESPONSE = {
  candidates: VIRAL_MOMENT_CANDIDATE[];
  podcast_tone: MOMENTS_PODCAST_TONE;
  podcast_tone_note: string;
  usage: SEGMENT_USAGE;
};
