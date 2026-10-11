import type { z } from "zod";

import type { MEDIA_NARRATE_REQUEST_SCHEMA } from "./schemas";

export type MEDIA_NARRATE_REQUEST = z.infer<typeof MEDIA_NARRATE_REQUEST_SCHEMA>;

export type NARRATE_WORD = { word: string; start: number; end: number };

/**
 * One footage-matching unit: 2-4 spoken words. `footageSeconds` tiles the
 * whole audio — the first phrase also covers the lead-in, each later phrase
 * runs until the next one starts, the last runs to the end — so cutting a
 * clip of exactly that length per phrase and playing them back to back covers
 * the narration with no gap and no overlap.
 */
export type NARRATE_PHRASE = {
  n: number;
  text: string;
  /** When the first word is spoken, seconds into the audio. */
  startSeconds: number;
  /** When the last word stops. */
  endSeconds: number;
  /** How long this phrase's footage must be. Sums to `durationSeconds`. */
  footageSeconds: number;
};

export type NARRATE_RESPELLING = { from: string; to: string; source: "channel" | "lexicon" | "rule" };

export type MEDIA_NARRATE_RESPONSE = {
  audioPath: string;
  durationSeconds: number;
  provider: string;
  voice: string;
  speed: number;
  /** The text actually spoken, after markup removal, respelling and punctuation clean-up. */
  spokenText: string;
  /** Words spoken differently from how they were written, and why. The captions keep the written form. */
  respelled: NARRATE_RESPELLING[];
  words: NARRATE_WORD[];
  phrases: NARRATE_PHRASE[];
};
