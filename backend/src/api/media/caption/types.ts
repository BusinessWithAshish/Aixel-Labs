import type { z } from "zod";

import type { MEDIA_CAPTION_PRESETS } from "../constants";
import type { MEDIA_CAPTION_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_CAPTION_REQUEST = z.input<typeof MEDIA_CAPTION_REQUEST_SCHEMA>;
export type MEDIA_CAPTION_REQUEST_PARSED = z.output<typeof MEDIA_CAPTION_REQUEST_SCHEMA>;
export type MEDIA_CAPTION_PRESET_VALUE = (typeof MEDIA_CAPTION_PRESETS)[number];

/** Style after defaults + position->alignment/margin resolution; what ffmpeg actually gets. */
export type CAPTION_STYLE_RESOLVED = {
  preset: MEDIA_CAPTION_PRESET_VALUE;
  fontName: string;
  fontSize: number;
  primaryColour: string;
  /** `chunks` only: the colour of the word being spoken. */
  highlightColour: string;
  outlineColour: string;
  outline: number;
  shadow: number;
  bold: boolean;
  uppercase: boolean;
  alignment: number;
  marginV: number;
  /** Left and right margin, source pixels. */
  marginH: number;
};

export type MEDIA_CAPTION_RESPONSE = {
  /** The burned-in video. Absent when `burn: false` — only the sidecar was written. */
  captionedPath?: string;
  /** The `.srt` actually rendered, always written so the text can be reviewed or reused. */
  subtitlePath: string;
  cueCount: number;
  /** Where the cues came from: the clip's own audio, or the caller's `subtitles`. */
  source: "transcribed" | "provided";
  /** Detected language, when transcription ran and Groq reported one. */
  language?: string;
  /** "roman" when Roman script was asked for (`script: "roman"`, or any `listener`) and every word shown is in it; absent otherwise. */
  script?: "roman";
  /** Why `script: "roman"` kept the native script, when it did. */
  scriptFallbackReason?: string;
  /** Who decided the words: "gemini" when the second listener's text was used, "whisper" otherwise. */
  listener?: "gemini" | "claude" | "whisper" | "apex";
  /** With `listener: "verified"`: which transcripts the words were decided from. */
  witnesses?: string[];
  /** Stretches the judge could not recover from any transcript; they carry no captions. */
  unclearStretches?: number;
  /** Set when the second listener could not be used: either the captions are Whisper's words alone (`listener: "whisper"`), or the judge worked from Whisper's passes without anyone having heard the clip (`listener: "claude"`). */
  listenerFallbackReason?: string;
  /** With a listener: the share of its words Whisper also heard (0–1). A measure of agreement about the WORDS; it no longer says anything about timing when `timing` is "aligned". */
  timingAnchoredShare?: number;
  /**
   * How each word got its time. "aligned": found in the clip's own audio by
   * forced alignment — exact. "matched": borrowed from Whisper by matching
   * spellings, approximate to a second or two for the words that did not match.
   * "whisper": Whisper's own word times. Transcribed captions only.
   */
  timing?: "aligned" | "matched" | "whisper" | "estimated";
  /** Why the words were not aligned to the audio, when they were not. */
  timingFallbackReason?: string;
  /** With `listener: "apex"`: who wrote the final words from the ear's transcript: "groq", "claude", or "none" (the ear's own spelling; both editors failed). */
  editor?: "groq" | "claude" | "none";
  /** Why the editor was not Groq, when it was not. */
  editorFallbackReason?: string;
  durationSeconds: number;
};
