import type { z } from "zod";

import type {
  MEDIA_ASPECT_RATIOS,
  MEDIA_BOUNDARY_MODES,
  MEDIA_GEMINI_MODEL,
  MEDIA_REFRAME_MODES,
} from "./constants";
import type { MEDIA_DIARIZE_REQUEST_SCHEMA } from "./diarize/schemas";
import type { MEDIA_CUT_REQUEST_SCHEMA } from "./cut/schemas";
import type { MEDIA_FETCH_REQUEST_SCHEMA } from "./fetch/schemas";
import type {
  DETECTED_REGION,
  HIDE_REGION,
  HIDE_STYLE,
  SURROUND_COLOUR,
} from "./effects/types";

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
export type MEDIA_REFRAME_VALUE = (typeof MEDIA_REFRAME_MODES)[number];
export type MEDIA_BOUNDARY_VALUE = (typeof MEDIA_BOUNDARY_MODES)[number];

/** How a clip's edges were placed when `boundaries: "natural"` was requested. */
export type CUT_CLIP_BOUNDARIES = {
  /** "moment": both edges chosen from the words in a wide window around the caller's pointer. */
  mode: "natural" | "moment";
  /** "pause": ends on a word followed by quiet; "reaction": also keeps the laugh/applause after it; "unchanged": kept the requested end. */
  endReason: "pause" | "reaction" | "unchanged";
  /** Why the requested range was kept as-is, when the audio could not be analysed. */
  fallbackReason?: string;
};

/** How a clip was actually framed when `reframe: "speaker"` was requested. */
export type CUT_CLIP_REFRAME = {
  /** "speaker" when the worker's plan was rendered; "center" when it fell back. */
  mode: MEDIA_REFRAME_VALUE;
  /** Why the centre crop was used instead, when it was. */
  fallbackReason?: string;
  /** Stretches rendered (cuts = segments - 1), wide ones included. */
  segments?: number;
  /** Of those, how many show the whole frame instead of one face. */
  wideSegments?: number;
  /** The worker's plan.json beside the clip — shots, faces, segments, timings. */
  planPath?: string;
};

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
  /** Local path to the media file — the caller's own path (untouched), or our downloaded copy under MEDIA_FETCH_DIR (named with a real extension when the content-type was recognized). */
  path: string;
  /** Response content-type, when we downloaded (undefined for a local-path passthrough — nothing to sniff). */
  contentType?: string;
  /** Downloaded byte count, when we downloaded. */
  sizeBytes?: number;
};

/** A generic time range to cut — deliberately not tied to any scorer's candidate shape, so `cut` works for any pipeline's clip list. */
export type CLIP_RANGE = {
  start: string;
  end: string;
  label?: string;
  /** What this moment is about, for `boundaries: "moment"` — see cut/schemas.ts. */
  moment?: string;
};

export type CUT_CLIP_RESULT = {
  label?: string;
  requestedStart: string;
  requestedEnd: string;
  /** Actual cut boundaries after boundary-snap + padding — may differ from requested. */
  cutStartSeconds: number;
  cutEndSeconds: number;
  snapped: boolean;
  /** "video" when the source has a video stream, "audio" when it doesn't — cut returns the same type it was given. See cut.ts's probeMediaStreams call. */
  mediaType: "video" | "audio";
  /** The framing actually applied — meaningless (kept for shape stability, always "original") when `mediaType` is "audio": there's no video stream to reframe. */
  aspectRatio: MEDIA_ASPECT_RATIO_VALUE;
  /** Present only when `boundaries: "natural"` was requested; cutStart/EndSeconds are then the placed edges. */
  boundaries?: CUT_CLIP_BOUNDARIES;
  /** Present only when `reframe: "speaker"` was requested for a video clip that is cropped. */
  reframe?: CUT_CLIP_REFRAME;
  /** Absent (and `error` set instead) when the requested range fell outside the source's actual duration — see cut.ts. */
  clipPath?: string;
  error?: string;
};

export type MEDIA_CUT_RESPONSE = {
  clips: CUT_CLIP_RESULT[];
  /** Present only when `logo` was requested. One plan per call — the logo does not move between clips. */
  logo?: CUT_LOGO_PLAN;
};

/** `cut`'s `logo` input — take a burned-in logo out of the source before any crop. */
export type CUT_LOGO_REQUEST = {
  regions: "auto" | HIDE_REGION[];
  style?: HIDE_STYLE;
  strength?: number;
  /** `style: "replace"` — the mark pasted where the source's was, before any crop. */
  replaceWith?: string;
  /** Key a flat background out of `replaceWith`; `"auto"` samples its corner pixel. */
  keyColor?: string;
};

/** What `cut` did about the logo, reported once per call (not per clip). */
export type CUT_LOGO_PLAN = {
  regions: HIDE_REGION[];
  covers: {
    region: HIDE_REGION;
    style: HIDE_STYLE;
    surround?: SURROUND_COLOUR;
    fellBackFrom?: HIDE_STYLE;
  }[];
  detected?: DETECTED_REGION[];
  /** The chain that was prepended to the first cut. Absent when nothing was covered. */
  filter?: string;
  /** The image the chain pastes from, when `replace` was used. */
  replaceWith?: string;
  note?: string;
};
