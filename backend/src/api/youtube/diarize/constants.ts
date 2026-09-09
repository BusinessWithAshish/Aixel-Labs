/**
 * YouTube-caption diarization — reads the video's own captions instead of
 * uploading audio to Gemini. Always free/near-free: at most one cheap
 * text-only Gemini call to label already-split turns, no audio ever leaves
 * this host. No fallback to Gemini-audio diarization lives here on purpose —
 * that's a real cost decision, made explicitly by whoever calls `media`
 * op=diarize themselves when this op fails, not something buried in a retry.
 */

/** Caption-turn labeling: YouTube ASR never names speakers, so we cap how many ids Gemini may invent. */
export const YOUTUBE_DIARIZE_MAX_CAPTION_SPEAKERS = 8;

export const YOUTUBE_DIARIZE_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  YOUTUBE_METADATA_FETCH_FAILED: "Failed to fetch YouTube video metadata",
  CAPTIONS_EMPTY: "YouTube captions were empty",
  GENERIC: "YouTube diarize failed",
} as const;

/**
 * YouTube ASR `>>` / `isSpeakerChange` only marks that the speaker changed,
 * not who. This text-only pass assigns speaker_1..N to already-split turns.
 * No audio. Used by captions.ts for 2-N person episodes.
 */
export const YOUTUBE_CAPTION_SPEAKER_LABEL_PROMPT = `You are labeling speakers on a conversational podcast/panel transcript.

Turns below are already split at YouTube ASR speaker-change marks. Each turn is ONE person holding the floor. A later turn is often someone who already spoke — reuse their id. Do NOT invent a new speaker for every turn.

Rules:
- Identify the distinct people actually talking (typically 2–5, never more than {{MAX_SPEAKERS}}).
- Label them speaker_1, speaker_2, … in order of first appearance.
- guessed_identity: a short name or role if the transcript makes it clear (e.g. "Jason", "host", "Jensen Huang"). Otherwise omit it.
- Same person returning after others MUST keep the same id.
{{SPEAKER_COUNT_HINT}}
Return one assignment per turn index i (0-based). Every turn index in the list must appear exactly once.

TURNS:
{{TURNS}}`;
