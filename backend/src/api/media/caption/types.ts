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
  /** "roman" when `script: "roman"` actually rewrote non-Latin words; absent otherwise. */
  script?: "roman";
  /** Why `script: "roman"` kept the native script, when it did. */
  scriptFallbackReason?: string;
  durationSeconds: number;
};
