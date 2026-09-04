/**
 * Diarization prompts — audio (Gemini) and YouTube-caption (text pass)
 * variants. Limits shared across the whole clipper (chunking, speakers,
 * Gemini retry policy) stay in the root `constants.ts`.
 */

/**
 * Rules shared by both the first-chunk and continuation-chunk diarization
 * prompts below — segmenting, backchannel handling, and laughter capture
 * don't depend on whether this is the first audio segment of an episode or
 * a later chunk. Validated against real episodes (see
 * backend/src/api/viral-clipper/README.md) — keep this in sync with any prompt
 * change made during future testing.
 */
const VIRAL_CLIPPER_DIARIZATION_SHARED_RULES = `- Produce a segment-level transcript: each segment is one continuous turn by one speaker, with start/end timestamps in MM:SS format (relative to the start of THIS audio clip — 00:00 is where this clip begins, not the wider episode) and the spoken text.
- Segment on speaker changes, not on pauses within one speaker's turn — do not create a new segment just because someone paused.
- If two people talk over each other briefly, attribute the segment to whichever speaker's speech is more prominent/audible.
- Do NOT create a standalone segment for a backchannel acknowledgment under ~2 seconds long (e.g. "yeah", "right", "hmm", "exactly") that doesn't take the floor away from the current speaker. Fold that moment silently into the surrounding segment of whoever is actually holding the floor — do not mention words like that at all. Only give the other speaker their own segment when they genuinely take over speaking for a real thought, not a one-word reaction.
- LAUGHTER IS A SIGNAL, NOT NOISE — unlike other backchannel sounds, always mark it, never discard it. When a speaker laughs (a chuckle, a short laugh, a genuine burst of laughter) insert an inline marker at the exact point it happens in that segment's text: [speaker_1 laughs], [speaker_2 laughs], or [both laugh] if simultaneous (use whichever speaker id actually applies — see below). Keep it brief — one marker per laugh, not a description of it — and do not create a standalone segment just for a laugh, mark it inline within whichever segment it falls in. This is the single most important thing downstream comedy-clip selection depends on, so do not skip it even on long clips to save space.`;

export const VIRAL_CLIPPER_DIARIZATION_PROMPT = `You are transcribing and diarizing a two-or-more-person conversational podcast episode.

Listen to the full audio and:
1. Identify each distinct speaker by voice. Label them speaker_1, speaker_2, etc. in order of first appearance.
2. For each speaker, guess their likely role/identity from context (e.g. "host", "guest") if inferable from how they're addressed or introduced — otherwise leave it empty.
${VIRAL_CLIPPER_DIARIZATION_SHARED_RULES}

Return ONLY the structured JSON per the schema. Do not include any text outside the JSON.`;

/**
 * Used for chunk 2+ of a long episode split by `diarize/audio.ts` (see
 * VIRAL_CLIPPER.CHUNK_DURATION_SECONDS). The request's audio parts are, in
 * order: one short reference clip per already-known speaker (extracted
 * from earlier chunks), then the new chunk's full audio as the FINAL part.
 * Voice-matching against the references — not just "start numbering from
 * where the last chunk left off" — is what keeps speaker_N consistent
 * across chunks despite each chunk being an otherwise-isolated
 * Gemini call with no memory of prior chunks.
 */
export const VIRAL_CLIPPER_DIARIZATION_CONTINUATION_PROMPT_HEADER = `You are transcribing and diarizing part of a longer two-or-more-person conversational podcast episode. This is a CONTINUATION — the speakers below were already identified in earlier parts of the same episode, and you're given a short reference clip of each one's voice before the main audio to diarize.

Reference clips, in order (each is its own audio file, listed before the main clip):
{{REFERENCE_LIST}}

Listen to each reference clip above first to learn what that speaker sounds like. Then listen to the FINAL audio file (the main clip) and diarize it:
1. For each segment, if the voice matches one of the reference clips, use that EXACT same id — never invent a new id for an already-known voice, even if their tone, energy, or background noise differs from the reference clip.
2. If a segment's voice does not match any reference clip — a genuinely new speaker not heard in this episode before — label it {{NEXT_SPEAKER_ID}}. If more than one new speaker appears, continue incrementing from there ({{NEXT_SPEAKER_ID}}, then the next number, etc.) — do not reuse an id from the reference list for a different person, and do not skip numbers.
3. Still fill in speaker_count/speakers/guessed_identity for the FULL set of speakers heard in this main clip (known + any new), the same as normal.
${VIRAL_CLIPPER_DIARIZATION_SHARED_RULES}

Return ONLY the structured JSON per the schema. Do not include any text outside the JSON.`;

/**
 * YouTube ASR `>>` / `isSpeakerChange` only marks that the speaker changed,
 * not who. This text-only pass assigns speaker_1..N to already-split turns.
 * No audio. Used by diarize/captions.ts for 2–N person episodes.
 */
export const VIRAL_CLIPPER_CAPTION_SPEAKER_LABEL_PROMPT = `You are labeling speakers on a conversational podcast/panel transcript.

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
