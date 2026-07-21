import type { z } from "zod";
import type { YOUTUBE_SUGGEST_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_SUGGEST_REQUEST = z.infer<
  typeof YOUTUBE_SUGGEST_REQUEST_SCHEMA
>;

/** A single parsed suggestion entry. */
export type YOUTUBE_SUGGEST_ITEM = {
  /** Suggestion text. */
  text: string;
  /**
   * Numeric suggestion-type code from the raw payload. `0` is the default
   * "query" suggestion; other codes are preserved verbatim.
   */
  type: number;
  /**
   * Subtype code list (e.g. `[512]` for a video suggestion, `[512, 433]`
   * when YouTube also tags a channel). YouTube does not document these
   * codes; we surface them as-is for downstream consumers.
   */
  subtypes: number[];
};

export type YOUTUBE_SUGGEST_RESPONSE = {
  /** The query echoed back by the suggestions endpoint. */
  query: string;
  /** Parsed suggestions, in the order YouTube returned them. */
  suggestions: YOUTUBE_SUGGEST_ITEM[];
  /** Number of suggestions returned. */
  totalResults: number;
  /** The raw JSONP body returned by YouTube (e.g. `window.google.ac.h([...])`). */
  raw: string;
};

// ─── Raw JSONP payload shape (internal — not exported) ─────────────────────────

/**
 * Raw shape of the array inside the `window.google.ac.h([...])` JSONP wrapper.
 *
 * `[query, suggestions[], metadata?]`
 * - `query` — string echo of the input.
 * - `suggestions[]` — array of `[text, type, subtypes[]]` tuples.
 * - `metadata` — opaque object (e.g. `{"k":1}`, `{"j":"1","k":1}`).
 */
export type YOUTUBE_SUGGEST_RAW_PAYLOAD = [
  string,
  Array<[string, number, number[]]>,
  Record<string, unknown>?,
];
