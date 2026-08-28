/**
 * Viral Clipper pipeline — single source of truth for Gemini wiring, prompts, and limits.
 * Diarization (audio -> speaker-labeled transcript) and viral-moment scoring
 * (transcript -> candidate short-form clips) both go through Gemini's
 * generateContent + structured-output (responseSchema) surface.
 */

export const VIRAL_CLIPPER_FIELD_DESCRIPTIONS = {
  audioSource:
    "Local filesystem path to the audio file to process (this pipeline runs on the VPS and reads files directly off disk), or a publicly-reachable audio URL.",
  model: "Optional Gemini model override.",
  diarized: "Diarized transcript object, as returned by POST /viral-clipper/diarize.",
  videoSource:
    "Local filesystem path to the SOURCE VIDEO (not audio-only) to cut clips from, or a publicly-reachable video URL — cutting needs the real video stream.",
  clips: "List of time ranges to cut, e.g. straight from /viral-moments' candidates.",
  diarizedForSnap:
    "Optional diarized transcript — when provided, each clip's start/end is snapped to the nearest real speech-segment boundary so cuts don't land mid-word. Omit to cut at the raw timestamps plus fixed padding only.",
  minClipSeconds: "Minimum candidate clip length in seconds.",
  maxClipSeconds:
    "Maximum candidate clip length in seconds — defaults to 60 (Shorts/Reels length). Raise this if you specifically want longer YouTube-Shorts-style clips, up to VIRAL_CLIPPER.MAX_CLIP_SECONDS.",
  channelContext:
    "Optional free-text description of the channel/show and its audience (e.g. niche, tone, typical audience) — used to weight which moments and hook_types fit this audience. Omit to use the generic (still high-quality) default.",
  audienceSignals:
    "Optional pre-fetched, pre-formatted lines of real audience behavior on this exact episode — e.g. from /viral-clipper/youtube-comments and/or /viral-clipper/youtube-chapters — used to bias candidate selection toward moments viewers/the creator already flagged. Fetch those endpoints yourself first; this field just takes their output.",
  aspectRatio:
    "Output aspect ratio for cut clips: '9:16' (Shorts/Reels/TikTok, default), '16:9' (YouTube/landscape), '1:1' (square), or 'original' (no crop, keep source framing). Cropping is centered on the source frame.",
  youtubeVideoUrl: "A YouTube video URL (any standard watch/share URL format).",
} as const;

export const VIRAL_CLIPPER_GEMINI_MODEL = {
  /** Stable GA flash-tier model — used for both diarization (audio) and viral-moment scoring (text). */
  DEFAULT: "gemini-3.5-flash",
} as const;

/** Supported output framings for `/viral-clipper/cut`. */
export const VIRAL_CLIPPER_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "original"] as const;

/**
 * Target pixel dimensions + integer width:height ratio per aspect ratio.
 * Ratios are kept as separate integers (not a precomputed float) so the
 * ffmpeg crop expression built in `ffmpeg-cut.ts` can compare
 * `iw*ratioH` vs `ih*ratioW` — cross-multiplication avoids any float
 * rounding / division-chain-order bugs in ffmpeg's own expression evaluator.
 */
export const VIRAL_CLIPPER_ASPECT_RATIO_DIMENSIONS = {
  "9:16": { ratioW: 9, ratioH: 16, outputWidth: 1080, outputHeight: 1920 },
  "16:9": { ratioW: 16, ratioH: 9, outputWidth: 1920, outputHeight: 1080 },
  "1:1": { ratioW: 1, ratioH: 1, outputWidth: 1080, outputHeight: 1080 },
} as const;

export const VIRAL_CLIPPER = {
  /** Gemini inline-request cap is ~20MB; anything at/above this always goes through the File API. */
  INLINE_AUDIO_MAX_BYTES: 20 * 1024 * 1024,
  /** Gemini's documented audio-per-prompt ceiling. */
  MAX_AUDIO_DURATION_SECONDS: 9.5 * 60 * 60,
  FILE_ACTIVE_POLL_INTERVAL_MS: 3000,
  FILE_ACTIVE_POLL_MAX_ATTEMPTS: 60,
  /**
   * Retry/key-pool policy (see `withGeminiKeyPoolRetry` in gemini-client.ts).
   * `GEMINI_API_KEY_FREE` may be a comma-separated list of keys — on a
   * daily-quota-exhausted error (confirmed via Gemini's own structured
   * error, quotaId containing "PerDay") the pool moves to the next key
   * immediately, since retrying the same key can't help until the quota
   * resets. On other transient errors (network blips, 5xx, non-daily 429),
   * it retries the SAME key up to this many times with exponential backoff
   * before giving up on that key and moving to the next.
   */
  GEMINI_MAX_ATTEMPTS_PER_KEY: 3,
  GEMINI_RETRY_BASE_DELAY_MS: 2000,
  GEMINI_RETRY_MAX_DELAY_MS: 15000,
  /** Hard validation bounds — callers can request anywhere in this range. */
  MIN_CLIP_SECONDS: 15,
  MAX_CLIP_SECONDS: 120,
  /** Defaults used when a caller doesn't specify — tuned for Shorts/Reels, not long-form YouTube clips. */
  DEFAULT_MIN_CLIP_SECONDS: 15,
  DEFAULT_MAX_CLIP_SECONDS: 60,
  DEFAULT_MIN_CANDIDATES: 8,
  DEFAULT_MAX_CANDIDATES: 12,
  DEFAULT_ASPECT_RATIO: "9:16" as const,
  /**
   * Boundary-snap: if the nearest diarized-segment boundary is within this
   * many seconds of the LLM-suggested cut point, snap to it (cheap, and
   * guarantees the cut lands on a real gap between speaker turns rather than
   * mid-word). If the nearest boundary is farther away — i.e. the suggested
   * timestamp sits deep inside one long segment — snapping all the way back
   * would make the clip unexpectedly long, so we fall back to the suggested
   * timestamp plus fixed padding instead. Segments are speaker-turn-level,
   * not word-level, so this is a best-effort reduction of mid-word cuts, not
   * a guarantee — see viral-clipper/README.md.
   */
  BOUNDARY_SNAP_MAX_DISTANCE_SECONDS: 3,
  /** Extra padding applied at the (possibly snapped) start/end so the very edge of speech isn't clipped. */
  CLIP_PADDING_SECONDS: 0.35,
  /** ffmpeg re-encode settings — clips are short (<=120s), so re-encoding is cheap and eliminates keyframe-boundary glitches entirely. */
  FFMPEG_VIDEO_CODEC: "libx264",
  FFMPEG_AUDIO_CODEC: "aac",
  FFMPEG_PRESET: "veryfast",
  FFMPEG_CRF: "20",
  /**
   * Diarization ceiling — confirmed empirically (2026-08-11) AND by
   * research: Gemini 3.5-flash's `maxOutputTokens` hard cap is 65536, that
   * cap is shared between "thinking" and visible-output tokens (not
   * separate budgets), and `thinkingLevel: "minimal"` is the lowest
   * settable level but can't reach zero (Gemini 3.x models always spend
   * some tokens on "thought signatures"). A 20-minute two-speaker
   * conversational chunk used ~46K of the 65536 combined budget; an
   * 80-minute single-call attempt still hit `finishReason=MAX_TOKENS` even
   * with minimal thinking. This is a hard per-call ceiling, not a tuning
   * parameter — long episodes are split into sequential chunks instead
   * (see `diarize.ts`).
   */
  CHUNK_DURATION_SECONDS: 15 * 60,
  /**
   * Only chunk audio longer than this. Kept below CHUNK_DURATION_SECONDS
   * so a slightly-over-one-chunk episode (e.g. 16 minutes) still gets a
   * single, simpler, non-chunked call instead of a wasteful 2-chunk split.
   */
  CHUNK_THRESHOLD_SECONDS: 18 * 60,
  /**
   * Length of the short reference clip extracted per known speaker and fed
   * into each subsequent chunk's prompt so Gemini can voice-match and keep
   * the same speaker_N id across chunks (see the continuation prompt in
   * this file). Long enough to carry a real voice fingerprint, short
   * enough to stay cheap to upload/process per chunk.
   */
  REFERENCE_CLIP_SECONDS: 7,
  /** Safety cap on how many distinct speakers' reference clips get carried into a continuation chunk's prompt. */
  MAX_REFERENCE_SPEAKERS: 6,
} as const;

export const VIRAL_CLIPPER_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

/**
 * YouTube audience-signal extraction (comments + chapters) now uses InnerTube.
 * yt-dlp is only used when a YouTube URL is passed as a media source (download).
 */
export const VIRAL_CLIPPER_YOUTUBE = {
  /** Clamped to YouTube comments max (200) — InnerTube pages are ~20 comments each. */
  DEFAULT_MAX_COMMENTS: 200,
} as const;

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
 * Used for chunk 2+ of a long episode split by `diarize.ts` (see
 * VIRAL_CLIPPER.CHUNK_DURATION_SECONDS). The request's audio parts are, in
 * order: one short reference clip per already-known speaker (extracted
 * from earlier chunks), then the new chunk's full audio as the FINAL part.
 * Voice-matching against the references — not just "start numbering from
 * where the last chunk left off" — is what keeps speaker_N consistent
 * across chunks despite each chunk being diarized in an otherwise-isolated
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

export const VIRAL_CLIPPER_VIRAL_MOMENTS_PROMPT_HEADER = `You are an elite short-form video producer. You have cut thousands of viral Reels/Shorts/TikToks out of long-form interviews, podcasts, and talk content, and your edge isn't just spotting what's interesting — it's knowing exactly where a clip should start and end.

Below is a full speaker-labeled, timestamped transcript of one episode. Inline [speaker_1 laughs] / [speaker_2 laughs] / [both laugh] markers show exactly where real, audible laughter happened — this is ground truth, not a guess, and it matters a lot below. Find the best {{MIN}}-{{MAX}} candidate moments for standalone short-form clips. Each clip's total duration MUST be between {{MIN_DURATION}} and {{MAX_DURATION}} seconds — never exceed {{MAX_DURATION}}s. If a moment you like genuinely needs longer than that to land, it is not a good candidate here: either find a tighter version of it or skip it.
{{CHANNEL_CONTEXT_BLOCK}}{{AUDIENCE_SIGNALS_BLOCK}}
READ THE ROOM FIRST. Before picking candidates, form an honest read of what this specific episode actually is — some podcasts are fundamentally COMEDY/ENTERTAINMENT (banter, roasting, funny stories, absurdist tangents, the point is to make people laugh) and others are fundamentally SERIOUS/INFORMATIVE (insight, vulnerability, advice, debate — a strong emotional or intellectual moment IS the payoff, laughter or not). Judge this from the transcript itself — how often and how genuinely the [laughs] markers fire is a direct signal, not just topic. Set podcast_tone (comedy / informative / mixed) and podcast_tone_note, and let this actually steer your selection below, not just label it.

EVERY GOOD CLIP HAS THREE PARTS. Use this to pick exact start/end points, not just an interesting middle:
1. HOOK (the first 1-3 seconds): the clip must open ON the hook itself — a bold claim, a sharp question, a striking number, or the first word of real emotion. Never open on a wind-up ("so basically...", a throat-clear, a half-finished setup that only makes sense once you already know where it's going). If the speaker takes a sentence or two to get to the actual hook, your 'start' timestamp goes AT the hook line — the run-up gets left out, not included.
2. BODY: the substance that pays off what the hook promised — the story, the argument, the specific detail. This is what keeps someone watching past second 3 instead of scrolling on.
3. BUTTON (the ending): end on a real stopping point — the punchline of a story, the resolution of a claim, the last word of a complete thought, or (only when the moment genuinely has one) a natural cliffhanger the speaker themselves lands on. Never end mid-sentence, mid-number, or on a filler word. If the real payoff lands a few seconds past your target length, either include it (as long as you're still under {{MAX_DURATION}}s total) or pick a different moment that actually resolves in time.

For each candidate, score it 0-100 on how well it would work as a STANDALONE clip with no context from the rest of the episode, and classify its hook_type:
- emotional_peak: a moment of real emotion (vulnerability, anger, joy, grief)
- quotable_line: a single sharp, tweetable sentence
- topic_conflict: disagreement, pushback, or a hot-take the guest defends
- story_payoff: the punchline/ending of a story that was being built up
- surprising_claim: a specific fact or number that makes the listener go "wait, what?"
- humor: something genuinely funny in delivery or content
- vulnerable_moment: an admission, confession, or moment of honesty that feels personal
- actionable_advice: concrete, specific advice someone would screenshot

Rules:
- The clip must make sense without prior context. In standalone_check, briefly state what a first-time viewer would need already established (ideally: nothing) — reject/skip moments that only land if you watched the first 20 minutes.
- In hook_line, quote the exact words (verbatim from the transcript) the clip should open on — this is what your 'start' timestamp must align to.
- In ending_note, name the specific line or beat the clip should end on and why it's a genuine stopping point (punchline / resolved claim / natural pause) — this is what your 'end' timestamp must align to. Never describe an ending that trails off mid-thought.
- Set has_audible_laughter to true ONLY if a [laughs]/[both laugh] marker falls within or right at the end of your chosen start/end range — read it off the transcript, don't infer or guess it.
- If podcast_tone is comedy or mixed: a moment where a joke actually LANDS (marked by real laughter at or just after the punchline) is your strongest possible signal, and should generally outscore an equally "interesting" but laugh-free stretch of storytelling or explanation. Being coherent, well-told, or informative is NOT the same as being clip-worthy on a comedy-driven show — do not select a candidate just because it reads smoothly if nobody actually laughs and nothing genuinely turns emotionally. The real definition of a good comedy clip is that it makes people laugh.
- If podcast_tone is informative: weight emotional/insight/conflict moments normally — laughter isn't required, but a moment that ALSO has it (has_audible_laughter=true) is still a bonus signal, never a penalty.
{{AUDIENCE_SIGNALS_RULE}}- Do not pick two candidates that are near-duplicates of the same beat.
- suggested_title should be the kind of title an actual Reels/Shorts creator would use (curiosity-driven, under ~10 words), not a dry description.
- why_it_works should name the specific mechanism (e.g. "specific numbers make the claim concrete and shareable", or "the guest's own laugh confirms the joke landed"), not a generic compliment.
- Sort candidates by score, descending, and set rank accordingly.

Return ONLY the structured JSON per the schema.

TRANSCRIPT:
`;

/**
 * Injected into `{{CHANNEL_CONTEXT_BLOCK}}` when a caller passes
 * `channelContext`; replaced with an empty string otherwise. Kept as its own
 * template (not string-concatenated ad hoc in viral-moments.ts) so the exact
 * wording — including the "don't fabricate" guard — stays in one place.
 */
export const VIRAL_CLIPPER_CHANNEL_CONTEXT_BLOCK_TEMPLATE = `
CHANNEL CONTEXT (use this to weight which moments and hook_types fit this specific audience — do not fabricate niche-specific claims that aren't actually in the transcript):
{{CHANNEL_CONTEXT}}
`;

/**
 * Injected into `{{AUDIENCE_SIGNALS_BLOCK}}` when the caller passes
 * pre-fetched YouTube comment-timestamp / chapter data (see
 * `youtube-comments.ts` / `youtube-chapters.ts`); empty string otherwise.
 * This is real audience behavior on THIS episode, not a guess — treat it
 * as a strong prior, not proof (comments can also flag something the
 * uploader's OWN Shorts already used, or a moment already well outside the
 * duration bound).
 */
export const VIRAL_CLIPPER_AUDIENCE_SIGNALS_BLOCK_TEMPLATE = `
AUDIENCE SIGNALS (real viewer behavior on this exact episode — timestamps viewers themselves called out as funny/memorable in comments, and/or the creator's own chapter markers):
{{AUDIENCE_SIGNALS}}
`;

/** Injected into `{{AUDIENCE_SIGNALS_RULE}}` only when AUDIENCE SIGNALS are present — kept out of the rules list entirely otherwise so the prompt doesn't reference a section that isn't there. */
export const VIRAL_CLIPPER_AUDIENCE_SIGNALS_RULE_TEMPLATE = `- Cross-reference candidates against AUDIENCE SIGNALS above: a moment near a timestamp multiple viewers independently called out is a real, above-baseline candidate — don't skip it even if it's not the most "quotable" line on paper. But don't force a low-quality candidate in just because a comment mentioned it either; audience signals raise a moment's priority, they don't override the hook/body/button and standalone requirements above.
`;

export const VIRAL_CLIPPER_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  MISSING_API_KEY: "GEMINI_API_KEY_FREE is not configured",
  DOWNLOAD_FAILED: "Failed to resolve source media",
  GEMINI_UPLOAD_FAILED: "Gemini file upload failed",
  GEMINI_FILE_NOT_ACTIVE: "Gemini file never became ACTIVE in time",
  GEMINI_REQUEST_FAILED: "Gemini generateContent request failed",
  GEMINI_EMPTY_RESPONSE: "Gemini returned no content",
  GEMINI_TRUNCATED_RESPONSE: "Gemini response was cut off before completing",
  GEMINI_MALFORMED_RESPONSE: "Gemini response did not match the expected shape",
  GEMINI_KEY_POOL_EXHAUSTED: "All Gemini API keys failed or are exhausted",
  FFMPEG_CUT_FAILED: "ffmpeg failed to cut clip",
  YOUTUBE_METADATA_FETCH_FAILED: "Failed to fetch YouTube video metadata",
  GENERIC: "Viral Clipper pipeline step failed",
} as const;
