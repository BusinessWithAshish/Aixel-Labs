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

/**
 * `X-Goog-FieldMask` for `/player`: only what `fetchPlayerCaptionTracks` reads.
 * The full response carries every streaming format, so this is what makes the
 * call cheap on the metered proxy: 433 KB down to 17 KB across 11 videos
 * (measured 2026-10-31).
 */
export const YOUTUBE_PLAYER_CAPTIONS_FIELD_MASK =
  "playabilityStatus.status,playabilityStatus.reason,captions.playerCaptionsTracklistRenderer.captionTracks";

// ─── Default request values ────────────────────────────────────────────────────

/** Default InnerTube `hl` for transcript requests. */
export const YOUTUBE_TRANSCRIPT_DEFAULT_HL = "en";
