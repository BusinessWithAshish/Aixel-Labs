import type { z } from "zod";

import type { VIRAL_CLIPPER_ASPECT_RATIOS, VIRAL_CLIPPER_GEMINI_MODEL } from "./constants";
import type {
  VIRAL_CLIPPER_CUT_REQUEST_SCHEMA,
  VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA,
  VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA,
} from "./schemas";

export type VIRAL_CLIPPER_DIARIZE_REQUEST = z.input<
  typeof VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA
>;
export type VIRAL_CLIPPER_DIARIZE_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_DIARIZE_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST = z.input<
  typeof VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA
>;
export type VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_VIRAL_MOMENTS_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_PIPELINE_REQUEST = z.input<
  typeof VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA
>;
export type VIRAL_CLIPPER_PIPELINE_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_PIPELINE_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_CUT_REQUEST = z.input<typeof VIRAL_CLIPPER_CUT_REQUEST_SCHEMA>;
export type VIRAL_CLIPPER_CUT_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_CUT_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST = z.input<
  typeof VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA
>;
export type VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_YOUTUBE_COMMENTS_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST = z.input<
  typeof VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA
>;
export type VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_PARSED = z.output<
  typeof VIRAL_CLIPPER_YOUTUBE_CHAPTERS_REQUEST_SCHEMA
>;

export type VIRAL_CLIPPER_GEMINI_MODEL_VALUE =
  (typeof VIRAL_CLIPPER_GEMINI_MODEL)[keyof typeof VIRAL_CLIPPER_GEMINI_MODEL];

export type VIRAL_CLIPPER_ASPECT_RATIO_VALUE = (typeof VIRAL_CLIPPER_ASPECT_RATIOS)[number];

/** A single Gemini `files.upload` -> ACTIVE-polled file, ready to reference by URI. */
export type GEMINI_ACTIVE_FILE = {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes?: string;
  state: string;
};

export type GEMINI_USAGE_METADATA = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  totalTokenCount?: number;
  cachedContentTokenCount?: number;
};

export type DIARIZED_SPEAKER = {
  id: string;
  guessed_identity?: string;
  talk_time_seconds_estimate?: number;
};

export type DIARIZED_SEGMENT = {
  speaker: string;
  start: string;
  end: string;
  text: string;
};

export type DIARIZED_TRANSCRIPT = {
  speaker_count: number;
  speakers: DIARIZED_SPEAKER[];
  segments: DIARIZED_SEGMENT[];
};

export type VIRAL_CLIPPER_DIARIZE_RESPONSE = {
  transcript: DIARIZED_TRANSCRIPT;
  usage: GEMINI_USAGE_METADATA;
};

export const VIRAL_CLIPPER_HOOK_TYPES = [
  "emotional_peak",
  "quotable_line",
  "topic_conflict",
  "story_payoff",
  "surprising_claim",
  "humor",
  "vulnerable_moment",
  "actionable_advice",
] as const;

export type VIRAL_CLIPPER_HOOK_TYPE = (typeof VIRAL_CLIPPER_HOOK_TYPES)[number];

export const VIRAL_CLIPPER_PODCAST_TONES = ["comedy", "informative", "mixed"] as const;

export type VIRAL_CLIPPER_PODCAST_TONE = (typeof VIRAL_CLIPPER_PODCAST_TONES)[number];

export type VIRAL_MOMENT_CANDIDATE = {
  rank: number;
  start: string;
  end: string;
  duration_seconds_estimate?: number;
  hook_type: VIRAL_CLIPPER_HOOK_TYPE;
  score: number;
  suggested_title: string;
  why_it_works: string;
  standalone_check: string;
  /** Verbatim opening line the clip's `start` should align to — see the hook/body/button rubric in constants.ts. */
  hook_line: string;
  /** Why the clip's `end` is a genuine stopping point (punchline / resolved claim / natural pause), not a mid-thought cut. */
  ending_note: string;
  /** True only if a [laughs]/[both laugh] marker (from diarize.ts) falls within this candidate's range — read off the transcript, not inferred. */
  has_audible_laughter: boolean;
};

export type VIRAL_CLIPPER_VIRAL_MOMENTS_RESPONSE = {
  candidates: VIRAL_MOMENT_CANDIDATE[];
  /** The model's read of this specific episode's genre — steers whether laughter or insight is weighted more heavily. See constants.ts. */
  podcast_tone: VIRAL_CLIPPER_PODCAST_TONE;
  podcast_tone_note: string;
  usage: GEMINI_USAGE_METADATA;
};

export type VIRAL_CLIPPER_PIPELINE_RESPONSE = {
  transcript: DIARIZED_TRANSCRIPT;
  candidates: VIRAL_MOMENT_CANDIDATE[];
  podcast_tone: VIRAL_CLIPPER_PODCAST_TONE;
  podcast_tone_note: string;
  usage: {
    diarize: GEMINI_USAGE_METADATA;
    viralMoments: GEMINI_USAGE_METADATA;
  };
};

/** A generic time range to cut — deliberately not tied to VIRAL_MOMENT_CANDIDATE's shape, so /cut works for any future pipeline's clip list. */
export type CLIP_RANGE = {
  start: string;
  end: string;
  label?: string;
};

export type CUT_CLIP_RESULT = {
  label?: string;
  requestedStart: string;
  requestedEnd: string;
  /** Actual cut boundaries after boundary-snap + padding — may differ from requested. */
  cutStartSeconds: number;
  cutEndSeconds: number;
  snapped: boolean;
  /** The framing actually applied — see VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS in constants.ts. */
  aspectRatio: VIRAL_CLIPPER_ASPECT_RATIO_VALUE;
  /** Absent (and `error` set instead) when the requested range fell outside the source video's actual duration — see cut.ts. */
  clipUrl?: string;
  error?: string;
};

export type VIRAL_CLIPPER_CUT_RESPONSE = {
  clips: CUT_CLIP_RESULT[];
};

export type CHAPTER_SIGNAL = {
  title: string;
  startSeconds: number;
  endSeconds: number;
};

export type VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE = {
  videoTitle: string;
  chapters: CHAPTER_SIGNAL[];
};

export type TIMESTAMP_MENTION_CLUSTER = {
  timestampSeconds: number;
  mentionCount: number;
  totalLikes: number;
  sampleComments: string[];
};

export type VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE = {
  videoTitle: string;
  commentsScanned: number;
  highlights: TIMESTAMP_MENTION_CLUSTER[];
};
