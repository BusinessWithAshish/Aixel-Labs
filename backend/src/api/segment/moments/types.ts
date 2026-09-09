import type { z } from "zod";

import type { GEMINI_USAGE_METADATA } from "../../media/types";
import type { MOMENTS_REQUEST_SCHEMA } from "./schemas";

export type MOMENTS_REQUEST = z.input<typeof MOMENTS_REQUEST_SCHEMA>;
export type MOMENTS_REQUEST_PARSED = z.output<typeof MOMENTS_REQUEST_SCHEMA>;

export const MOMENTS_HOOK_TYPES = [
  "emotional_peak",
  "quotable_line",
  "topic_conflict",
  "story_payoff",
  "surprising_claim",
  "humor",
  "vulnerable_moment",
  "actionable_advice",
] as const;

export type MOMENTS_HOOK_TYPE = (typeof MOMENTS_HOOK_TYPES)[number];

export const MOMENTS_PODCAST_TONES = ["comedy", "informative", "mixed"] as const;

export type MOMENTS_PODCAST_TONE = (typeof MOMENTS_PODCAST_TONES)[number];

export type VIRAL_MOMENT_CANDIDATE = {
  rank: number;
  start: string;
  end: string;
  duration_seconds_estimate?: number;
  hook_type: MOMENTS_HOOK_TYPE;
  score: number;
  suggested_title: string;
  why_it_works: string;
  standalone_check: string;
  /** Verbatim opening line the clip's `start` should align to — see the hook/body/button rubric in constants.ts. */
  hook_line: string;
  /** Why the clip's `end` is a genuine stopping point (punchline / resolved claim / natural pause), not a mid-thought cut. */
  ending_note: string;
  /** True only if a [laughs]/[both laugh] marker (from diarize) falls within this candidate's range — read off the transcript, not inferred. */
  has_audible_laughter: boolean;
};

export type MOMENTS_RESPONSE = {
  candidates: VIRAL_MOMENT_CANDIDATE[];
  /** The model's read of this specific episode's genre — steers whether laughter or insight is weighted more heavily. See constants.ts. */
  podcast_tone: MOMENTS_PODCAST_TONE;
  podcast_tone_note: string;
  usage: GEMINI_USAGE_METADATA;
};
