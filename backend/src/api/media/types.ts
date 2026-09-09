import type { z } from "zod";

import type { MEDIA_ASPECT_RATIOS, MEDIA_GEMINI_MODEL } from "./constants";
import type { MEDIA_DIARIZE_REQUEST_SCHEMA } from "./diarize/schemas";
import type { MEDIA_CUT_REQUEST_SCHEMA } from "./cut/schemas";
import type { MEDIA_FETCH_REQUEST_SCHEMA } from "./fetch/schemas";

export type MEDIA_DIARIZE_REQUEST = z.input<typeof MEDIA_DIARIZE_REQUEST_SCHEMA>;
export type MEDIA_DIARIZE_REQUEST_PARSED = z.output<
  typeof MEDIA_DIARIZE_REQUEST_SCHEMA
>;

export type MEDIA_CUT_REQUEST = z.input<typeof MEDIA_CUT_REQUEST_SCHEMA>;
export type MEDIA_CUT_REQUEST_PARSED = z.output<typeof MEDIA_CUT_REQUEST_SCHEMA>;

export type MEDIA_FETCH_REQUEST = z.input<typeof MEDIA_FETCH_REQUEST_SCHEMA>;
export type MEDIA_FETCH_REQUEST_PARSED = z.output<
  typeof MEDIA_FETCH_REQUEST_SCHEMA
>;

export type MEDIA_GEMINI_MODEL_VALUE =
  (typeof MEDIA_GEMINI_MODEL)[keyof typeof MEDIA_GEMINI_MODEL];

export type MEDIA_ASPECT_RATIO_VALUE = (typeof MEDIA_ASPECT_RATIOS)[number];

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

/**
 * Always Gemini audio — the YouTube-captions path is a separate op in a
 * separate domain now (`youtube` op=`diarize`, `YOUTUBE_DIARIZE_RESPONSE` in
 * `api/youtube/diarize/types.ts`), so there's no longer a second source this
 * type needs to discriminate between.
 */
export type MEDIA_DIARIZE_RESPONSE = {
  transcript: DIARIZED_TRANSCRIPT;
  usage: GEMINI_USAGE_METADATA;
};

/**
 * What `fetch` hands back: just the local path. A local input passes
 * through untouched; a downloaded one lands in `MEDIA_FETCH_DIR` (a fixed
 * persistent folder, not a temp dir), so there's nothing else to report —
 * no ownership flag, no cleanup-tracking directory.
 *
 * Deliberately no duration/resolution/fps here either — a full probe would
 * mean adding `ffprobe-static` as a second binary dependency for fields
 * nothing downstream needs (aspect-ratio reframing works off ffmpeg's own
 * `iw`/`ih` expressions; `cut`/`condense` read duration themselves off the
 * same banner `getMediaDurationSeconds` already parses).
 */
export type MEDIA_FETCH_RESPONSE = {
  /** Local path to the media file — the caller's own path (untouched), or our downloaded copy under MEDIA_FETCH_DIR. */
  path: string;
};

/** A generic time range to cut — deliberately not tied to any scorer's candidate shape, so `cut` works for any pipeline's clip list. */
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
  /** The framing actually applied — see MEDIA_ASPECT_RATIO_DIMENSIONS in constants.ts. */
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE;
  /** Absent (and `error` set instead) when the requested range fell outside the source video's actual duration — see cut.ts. */
  clipPath?: string;
  error?: string;
};

export type MEDIA_CUT_RESPONSE = {
  clips: CUT_CLIP_RESULT[];
};
