// ─── Caption track kinds ───────────────────────────────────────────────────────

/** InnerTube `captionTracks[].kind` value marking auto-generated (ASR) tracks. */
export const YOUTUBE_TRANSCRIPT_TRACK_KIND = {
  ASR: "asr",
} as const;

// ─── timedtext format ──────────────────────────────────────────────────────────

/** timedtext `fmt` query param value — JSON3 is the structured payload we parse. */
export const YOUTUBE_TIMEDTEXT_FORMAT = "json3" as const;

/** Regex stripping any existing `fmt=` param before appending our own. */
export const YOUTUBE_TIMEDTEXT_FMT_PARAM_PATTERN = /&fmt=[^&]+/g;

// ─── InnerTube `/player` playability statuses ──────────────────────────────────

/**
 * `/player` `playabilityStatus.status` values we treat as playable.
 *
 * `OK` is the normal case; `LIVE_STREAM_OFFLINE` still exposes caption tracks
 * for scheduled streams, so we accept it.
 */
export const YOUTUBE_PLAYER_PLAYABILITY_OK_STATUSES = [
  "OK",
  "LIVE_STREAM_OFFLINE",
] as const;

// ─── Default request values ────────────────────────────────────────────────────

/** Default InnerTube `hl` for transcript requests. */
export const YOUTUBE_TRANSCRIPT_DEFAULT_HL = "en";
