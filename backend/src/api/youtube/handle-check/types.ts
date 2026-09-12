import type { z } from "zod";

import type { YOUTUBE_HANDLE_CHECK_REQUEST_SCHEMA } from "./schemas";

export type YOUTUBE_HANDLE_CHECK_REQUEST = z.infer<
  typeof YOUTUBE_HANDLE_CHECK_REQUEST_SCHEMA
>;

/** Why a candidate is not a valid YouTube handle (null when it is valid). */
export type YOUTUBE_HANDLE_INVALID_REASON =
  | "too_short"
  | "too_long"
  | "invalid_chars"
  | "leading_or_trailing_period"
  | "consecutive_periods";

export type YOUTUBE_HANDLE_CHECK_ITEM = {
  /** The candidate exactly as supplied. */
  input: string;
  /** Normalized handle (trimmed, leading @ stripped) — what a URL would use. */
  handle: string;
  /** Passes YouTube's handle format rules (3–30 chars from [A-Za-z0-9._-]). */
  valid: boolean;
  /** Set when `valid` is false. */
  reason?: YOUTUBE_HANDLE_INVALID_REASON;
  /**
   * Whether the handle is free to claim. null when not checked (invalid format,
   * so no lookup was made).
   */
  available: boolean | null;
  /** The channel id that already owns the handle, when taken. */
  channelId: string | null;
  /** youtube.com/@handle URL for the candidate. */
  url: string;
};

export type YOUTUBE_HANDLE_CHECK_RESPONSE = {
  results: YOUTUBE_HANDLE_CHECK_ITEM[];
};
