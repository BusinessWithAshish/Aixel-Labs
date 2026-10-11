import type { z } from "zod";

import type { MEDIA_ASSEMBLE_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_ASSEMBLE_REQUEST = z.infer<typeof MEDIA_ASSEMBLE_REQUEST_SCHEMA>;

export type ASSEMBLED_SENTENCE = {
  n: number;
  /** Where this sentence's audio starts in the finished video. */
  startSeconds: number;
  /** Where its audio (not the pause after it) ends. */
  endSeconds: number;
  audioSeconds: number;
  /** Seconds of last-frame hold inserted because a clip was shorter than its slot. 0 when the footage was long enough. */
  heldSeconds: number;
};

export type MEDIA_ASSEMBLE_RESPONSE = {
  outputPath: string;
  durationSeconds: number;
  videoSeconds: number;
  audioSeconds: number;
  width: number;
  height: number;
  sentences: ASSEMBLED_SENTENCE[];
  /** An SRT of every phrase at its true time in the finished video — hand it to `caption` as `subtitles`. */
  subtitlesPath: string;
  cueCount: number;
};
