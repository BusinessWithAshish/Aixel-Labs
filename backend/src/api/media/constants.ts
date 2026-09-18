import { resolve } from "node:path";

import { AIXEL_MEDIA } from "../../media";

/**
 * Video module — single source of truth for Gemini wiring, prompts, and limits.
 * Diarization (audio -> speaker-labeled transcript) and viral-moment scoring
 * (transcript -> candidate short-form clips) both go through Gemini's
 * generateContent + structured-output (responseSchema) surface.
 */

export const MEDIA_FIELD_DESCRIPTIONS = {
  cutLogo:
    "Take a burned-in logo (a creator's bug, a sponsor ident) out of the SOURCE before anything is cropped. This is the right place for it and `effects` is not: in the source frame the logo never moves, while in a clip that has been reframed to follow the speaker it lands somewhere different from moment to moment. Covering it here means the reframe, the captions and everything after simply never see it. `regions: \"auto\"` cuts one short unframed probe from the source and finds the logo itself; an explicit list of SOURCE-pixel rectangles skips the probe, which is the better path once a creator's mark is known. `style: \"fill\"` (default) paints the region in the colour of the background around it — invisible on a plain set — and falls back to `blur` when that background is not flat enough, reporting why.",
  effectsHide:
    "Cover part of every frame — a creator's bug, a sponsor ident, a broadcaster watermark. `regions: \"auto\"` finds burned-in overlays itself (static across the clip AND structured, so a plain dark background is not mistaken for one) and always writes a proof still with the boxes drawn on it, so what got covered can be checked rather than trusted. Explicit `[{x,y,width,height}]` regions in SOURCE PIXELS skip detection entirely — the right choice once a creator's mark is known, since it sits in the same place in everything they publish.",
  effectsLogo:
    "Composite your own mark onto every frame from a local image file (PNG with alpha normally). Applied LAST, after grade and hide, so your own mark is never graded or blurred.",
  effectsVideoSource:
    "Local filesystem path (normally a `cut` output) or a publicly-reachable URL of the video to treat. Grade BEFORE captioning: captions are burned white-with-outline, and grading afterwards shifts their colour.",
  effectsGrade:
    "The colour treatment. `preset` names one of the built-in looks; every other field is an override applied on top of it, so `{preset: \"warm\", saturation: 1.2}` is the warm look with more saturation. Omit `grade` entirely with `preview: true` to see every preset at once.",
  effectsPreview:
    "true = render no video. Instead, grab still frames from the clip, apply EVERY preset to each one, and tile them into a labelled contact sheet per frame so the looks can be compared side by side on the same footage. This is how a look gets chosen — a grade is judged by eye on real frames, not from its numbers.",
  effectsAt:
    "Preview only: which timestamps (seconds) to grab frames at, one sheet per timestamp. Defaults to two frames, a third and two thirds of the way in, because a grade reads very differently on a bright scene and a dark one.",
  sharePath:
    "Absolute path of a file this backend produced under the private media root (e.g. a `caption` or `cut` output).",
  mediaSource:
    "Local filesystem path to the audio or video file to diarize (this pipeline runs on the VPS and reads files directly off disk), or a publicly-reachable audio/video URL. Video input is fine — only the audio track is ever uploaded to Gemini. Not for YouTube links: use `youtube` op=diarize for the free captions path, or `youtube` op=video_download then pass the resulting local path here.",
  videoUrl:
    "YouTube watch/share URL or video id. Uses that video's captions (ASR `>>` turn marks or authored Name: labels) instead of Gemini audio diarization. Mutually exclusive with audioSource.",
  language: "Caption language (BCP-47). Only used with videoUrl. Defaults to en.",
  model:
    "Optional Gemini model override. Used for audio diarization and for labeling YouTube-caption turns (no audio upload).",
  speakerCount:
    "Optional hint for how many distinct people are talking (2–8). Only used with videoUrl ASR captions. Omit to let the model infer.",
  diarized: "Diarized transcript object, as returned by POST /video/diarize.",
  source:
    "Media to resolve to a local file: a local filesystem path (returned as-is), or any publicly-reachable media URL (downloaded). Not for YouTube links — use `youtube` op=video_download for those and pass this the resulting local path instead; a YouTube URL given here is just a URL and will fail to resolve as one.",
  fetchImageOnly:
    "Reject the download unless the response is a real image content-type (jpeg/png/webp/gif) — for staging a reference image (e.g. a competitor's post) to view or attach elsewhere, where silently saving a login-wall HTML page or an unusable format is worse than a clear error. Omit for a plain media fetch with no content-type check.",
  fetchMaxBytes:
    "Reject the download if it exceeds this many bytes. Checked against Content-Length up front when the server sends one, and against the actual file size after writing either way. Omit for no limit.",
  videoSource:
    "Local filesystem path to the SOURCE VIDEO (not audio-only) to cut clips from, or a publicly-reachable video URL — cutting needs the real video stream.",
  clips: "List of time ranges to cut — `{ start, end, label? }` — start/end as seconds (number, e.g. 1082) or an HH:MM:SS / MM:SS timestamp string. Any source of ranges works; nothing here is tied to a particular scorer.",
  diarizedForSnap:
    "Optional diarized transcript — when provided, each clip's start/end is snapped to the nearest real speech-segment boundary so cuts don't land mid-word. Omit to cut at the raw timestamps plus fixed padding only.",
  minClipSeconds: "Minimum candidate clip length in seconds.",
  maxClipSeconds:
    "Maximum candidate clip length in seconds — defaults to 60 (Shorts/Reels length). Raise this if you specifically want longer YouTube-Shorts-style clips, up to MEDIA.MAX_CLIP_SECONDS.",
  channelContext:
    "Optional free-text description of the channel/show and its audience (e.g. niche, tone, typical audience) — used to weight which moments and hook_types fit this audience. Omit to use the generic (still high-quality) default.",
  audienceSignals:
    "Optional pre-fetched, pre-formatted lines of real audience behavior on this exact episode — e.g. from the youtube module's comments-intel timestamp clusters and/or video chapters, formatted via its audience-signal formatters — used to bias candidate selection toward moments viewers/the creator already flagged. Fetch those yourself first; this field just takes the output.",
  aspectRatio:
    "Output aspect ratio for cut clips: '9:16' (Shorts/Reels/TikTok, default), '16:9' (YouTube/landscape), '1:1' (square), or 'original' (no crop, keep source framing). Cropping is centered on the source frame.",
  reframe:
    "How a cut clip is framed when aspectRatio crops the source: 'center' (default) keeps the fixed centre crop; 'speaker' follows whoever is talking — camera cuts, face tracking and LR-ASD lip-sync (each face's lip motion matched to the audio) choose the face for each stretch, and the crop cuts on speech onsets. Slower: about 50 s of CPU per clip. Needs the reframe worker installed on this host (backend/workers/reframe); when it cannot run or finds no faces the clip still gets the centre crop and `reframe.fallbackReason` says why. Ignored for audio sources and for aspectRatio 'original'.",
  boundaries:
    "Where each clip's edges land: 'exact' (default) cuts at the requested start/end plus a little padding; 'natural' re-places them on the clip's own audio — start on the first word of the phrase instead of mid-word, end after the last word of the thought plus any laugh or applause that follows (until it quiets, never into the next sentence). Moves edges by a few seconds at most; the range you ask for still decides what the clip is. Costs one short Groq transcription per clip. cutStartSeconds/cutEndSeconds report where the clip actually starts and ends; clips[].boundaries says why.",
  cutLanguage:
    "Optional spoken-language hint (ISO 639-1, e.g. 'hi', 'en') for boundaries: 'natural', which transcribes the audio around each edge. Pass it for anything not plainly English — auto-detection hears short mixed Hindi-English windows as English and drops the Hindi words.",
  captionScript:
    "'native' (default) writes words in the script the transcription produced. 'roman' rewrites non-Latin words in everyday Roman script — Hindi/Hinglish as typed on social media ('kya scene hai'), English words spoken inside Hindi in normal English spelling — one word for one word, so timings are unchanged (one small Gemini text call per clip). Pair it with `language` (e.g. 'hi') so the clip is transcribed in its real language first; otherwise Hindi speech is often dropped. Words already in Latin script are untouched; if the rewrite fails the native script is kept and scriptFallbackReason says why.",
  captionVideoSource:
    "Local filesystem path to the video to caption — normally an already-cut clip, not a full episode. A publicly-reachable video URL also works.",
  captionSubtitles:
    "Optional SRT or VTT to burn in: either the subtitle text itself, or a local path to a .srt/.vtt file. OMIT THIS for the normal case — the clip's own audio is transcribed instead, which is both more accurate and already timed from zero. Only pass this when you have subtitles that must be used verbatim; timings are taken as-is and are assumed to be relative to the start of THIS video, not the episode it was cut from.",
  captionStyle:
    "Optional appearance overrides. `preset`: 'lines' (default) — white bold sentence lines with a heavy black outline in the middle band; 'chunks' — 1–3 big uppercase words at a time (Anton), the word being spoken in `highlightColour` (default yellow), each new chunk sliding up into place, positioned 'above-ui' (just above the handle/caption/subscribe block Reels and Shorts draw at the bottom). 'chunks' needs word timings, so it applies when the op transcribes; supplied `subtitles` render as 'lines'. `position`: middle | lower-third | bottom | above-ui. Any explicit field overrides the preset's default.",
  captionWrap:
    "Optional line-breaking overrides. Whisper returns long unbroken segments; they are re-wrapped into short lines so captions stay readable on a phone. Defaults: 32 characters per line, 2 lines on screen at once.",
  captionBurn:
    "Burn the captions into the video (default true). Set false to only generate the .srt sidecar and skip re-encoding — useful when you want to review or edit the text before committing to a render.",
} as const;

export const MEDIA_GEMINI_MODEL = {
  /** Stable GA flash-tier model — used for both diarization (audio) and viral-moment scoring (text). */
  DEFAULT: "gemini-3.5-flash",
} as const;

/** Supported output framings for `/video/cut`. */
export const MEDIA_ASPECT_RATIOS = ["9:16", "16:9", "1:1", "original"] as const;

/** How `/video/cut` frames a cropped clip: fixed centre, or follow the speaker. */
export const MEDIA_REFRAME_MODES = ["center", "speaker"] as const;

/** A speaker-reframe segment either crops to one face or shows the whole frame ("wide"). */
export const MEDIA_REFRAME_LAYOUTS = ["crop", "wide"] as const;

/**
 * Target pixel dimensions + integer width:height ratio per aspect ratio.
 * Ratios are kept as separate integers (not a precomputed float) so the
 * ffmpeg crop expression built in `ffmpeg-cut.ts` can compare
 * `iw*ratioH` vs `ih*ratioW` — cross-multiplication avoids any float
 * rounding / division-chain-order bugs in ffmpeg's own expression evaluator.
 */
export const MEDIA_ASPECT_RATIO_DIMENSIONS = {
  "9:16": { ratioW: 9, ratioH: 16, outputWidth: 1080, outputHeight: 1920 },
  "16:9": { ratioW: 16, ratioH: 9, outputWidth: 1920, outputHeight: 1080 },
  "1:1": { ratioW: 1, ratioH: 1, outputWidth: 1080, outputHeight: 1080 },
} as const;

/**
 * Speaker reframe (`cut` with `reframe: "speaker"`). Analysis is a Python
 * worker (`backend/workers/reframe`, set up with `pnpm setup:reframe`)
 * spawned once per clip; rendering stays in ffmpeg here — see `cut/reframe.ts`.
 */
export const MEDIA_REFRAME = {
  DEFAULT_MODE: "center" as const,
  /** `src/api/media` and `dist/api/media` are both three levels below `backend/`. */
  WORKER_DIR: process.env.REFRAME_WORKER_DIR || resolve(__dirname, "../../../workers/reframe"),
  /** Empty = `<WORKER_DIR>/.venv/bin/python`. */
  PYTHON_BIN: process.env.REFRAME_PYTHON || "",
  /** Empty = the worker's own `models/` folder. */
  MODELS_DIR: process.env.REFRAME_MODELS_DIR || "",
  /** Per clip. A 60 s clip plans in about a minute; this only guards a hung worker. */
  WORKER_TIMEOUT_MS: 15 * 60 * 1000,
  WORKER_MAX_BUFFER_BYTES: 32 * 1024 * 1024,
  /**
   * Wide segments fit the whole frame to the output width over a blurred,
   * zoomed copy of the same frame. The copy is blurred at this fraction of
   * the output size (same look, a fraction of the cost), with this box radius.
   */
  WIDE_BACKGROUND_SCALE: 0.25,
  WIDE_BACKGROUND_BLUR_RADIUS: 12,
  /**
   * Seconds two faces must talk over each other before the frame pulls out to
   * show both.
   *
   * At the worker's own default of 1.5 s a short interjection never qualified:
   * the host says two words over the guest — well under a second — the crop
   * stays on the guest, and the viewer hears a voice with nobody on screen.
   * 0.8 s catches a two-word interjection while staying above the 0.45 s
   * minimum-run merge, so the frame does not flicker on every "mm-hmm".
   *
   * Passed explicitly rather than left to the worker so the value lives here
   * with the rest of the tuning, not in Python.
   */
  WIDE_OVERLAP_SECONDS: 0.8,
} as const;

/** How `/video/cut` places a clip's edges: exactly as requested, or on the audio's natural stops. */
export const MEDIA_BOUNDARY_MODES = ["exact", "natural"] as const;

/**
 * `boundaries: "natural"` (see `cut/natural-boundaries.ts`). The requested
 * range comes from a transcript whose timestamps are seconds-coarse, so the
 * edges are re-placed on the clip's own audio: word timings from Groq plus
 * loudness. Every number here keeps the adjustment SMALL — the ranker decides
 * what the clip is; this only stops it starting or ending mid-word, and keeps
 * the laugh after a punchline.
 */
export const MEDIA_NATURAL_BOUNDARIES = {
  DEFAULT_MODE: "exact" as const,
  /** Extra audio cut around the requested range so edges can move outward. */
  WINDOW_BEFORE_SECONDS: 3,
  WINDOW_AFTER_SECONDS: 8,
  /** A new start is a speech onset after at least this much quiet, this close to the requested start. */
  ONSET_MIN_GAP_SECONDS: 0.3,
  START_SEARCH_BEFORE_SECONDS: 1.5,
  START_SEARCH_AFTER_SECONDS: 1,
  /** Start this long before the first word, so its attack is not clipped. */
  LEAD_SECONDS: 0.12,
  /** A stop is the end of a word followed by at least this much quiet… */
  PAUSE_MIN_SECONDS: 0.45,
  /** …or a sentence-ending word, or the end of a Whisper phrase (within the tolerance) followed by at least a breath. */
  PHRASE_PAUSE_MIN_SECONDS: 0.15,
  PHRASE_END_TOLERANCE_SECONDS: 0.15,
  /**
   * Where to look for the end's stop, around the requested end. Both ways:
   * transcript timestamps are whole seconds, so a requested end usually sits
   * 1–3 s AFTER the real stop, and searching only later lands on a breath
   * inside the next sentence.
   */
  END_SEARCH_BEFORE_SECONDS: 3,
  END_SEARCH_AFTER_SECONDS: 6,
  /**
   * Among those stops the one that looks most like an ending wins: score =
   * quiet after it (capped) + reaction after it − distance from the requested
   * end × a penalty, steeper after the requested end than before it (past it
   * is where the next sentence or a song starts). A punchline has a pause or a
   * laugh after it; a breath mid-sentence has neither.
   */
  END_GAP_SCORE_CAP_SECONDS: 2,
  END_PENALTY_BEFORE_PER_SECOND: 0.15,
  END_PENALTY_AFTER_PER_SECOND: 0.3,
  /** Extra cost per word spoken between the requested end and a later stop. */
  END_PENALTY_PER_WORD_CROSSED: 0.3,
  /**
   * Whisper reports a word's end early — it snaps to its own frame grid — so
   * cutting on that number clips the last syllable, and the fade then runs over
   * what is left. After the stop the audio itself is followed while it is still
   * speech (a much lower bar than a reaction: this is one voice trailing off,
   * not a room reacting), for at most MAX.
   */
  SPEECH_TAIL_DB_ABOVE_FLOOR: 3,
  SPEECH_TAIL_QUIET_HOLD_SECONDS: 0.1,
  SPEECH_TAIL_MAX_SECONDS: 0.6,
  /**
   * Where the clip actually ends: a real pause in the AUDIO, not a gap between
   * Whisper's word timestamps. On fast, overlapping speech Whisper returns word
   * gaps of exactly zero and starts the next word up to a second early, so
   * word-based stops end a clip mid-syllable or a beat into the next person's
   * first word — while the waveform shows an unmistakable 0.5–1 s dip in the
   * same place. A pause is this far below the room's loudest speech, lasting at
   * least MIN; the cut lands OFFSET into it, so the last syllable finishes and
   * nothing of the next line is heard.
   */
  PAUSE_DB_BELOW_SPEECH: 25,
  /** A breath mid-sentence is ~0.2 s and looks identical in the waveform; the end of a thought runs longer. */
  PAUSE_MIN_AUDIO_SECONDS: 0.35,
  /**
   * How far INTO the chosen pause the cut lands — i.e. how much breathing room
   * the clip gets after the last word.
   *
   * Measured 2026-09-18 across 11 shipped clips from two episodes: every one
   * of them had effectively zero quiet at the end. The boundary picker was
   * working correctly — it reported `endReason: "pause"` and had genuinely
   * found a real pause — but at 0.12 s it cut almost on top of the last
   * syllable, so a correctly-chosen ending still *felt* abrupt.
   *
   * The clamp below (`length / 2`) is what makes a larger value safe: the cut
   * never goes past the middle of the pause, so a short pause still yields a
   * short offset and nothing of the next line is ever heard. On a minimum
   * 0.35 s pause this gives 0.175 s; on a generous one, the full value.
   */
  PAUSE_CUT_OFFSET_SECONDS: 0.4,
  /** How much a longer pause is worth when choosing between them (seconds, capped). */
  PAUSE_LENGTH_SCORE_CAP_SECONDS: 1,
  /**
   * The audio says where a line stops; the words say whether it FINISHED. A
   * pause the speaker ends a sentence into beats a breath they took mid-clause,
   * so a pause is worth more when the word before it closes a sentence, and a
   * little more when Whisper ended one of its own phrases there too.
   */
  PAUSE_SENTENCE_BONUS: 1,
  PAUSE_PHRASE_BONUS: 0.5,
  /** When nothing in the normal window is a pause, look this much further before giving up on the audio. */
  PAUSE_SEARCH_EXTRA_SECONDS: 3,
  /** After the stop, keep loud audio with no words (laughter, applause) for at most this long. */
  REACTION_MAX_SECONDS: 3.5,
  /** "Loud" = this many dB above the window's noise floor (its NOISE_FLOOR_PERCENTILE loudness). */
  REACTION_DB_ABOVE_FLOOR: 8,
  NOISE_FLOOR_PERCENTILE: 20,
  /** The reaction is over after this much continuous quiet. */
  QUIET_HOLD_SECONDS: 0.3,
  /** Shorter tails than this are reported as a plain pause. */
  REACTION_MIN_SECONDS: 0.6,
  TAIL_PAD_SECONDS: 0.2,
  /**
   * Audio fades on the trimmed clip. The out-fade is what an editor does when
   * the next voice or the crowd is already coming in: the clip ends softly
   * instead of on a clipped syllable.
   */
  FADE_IN_SECONDS: 0.1,
  /**
   * Short enough to live inside the pad after the last word. At 0.35 s it faded
   * the final syllable itself, which reads as a clip cut off mid-sentence even
   * when the audio is all there.
   */
  FADE_OUT_SECONDS: 0.15,
  /** Never run into the next word. */
  NEXT_WORD_GUARD_SECONDS: 0.05,
  /** Loudness resolution. */
  FRAME_SECONDS: 0.05,
  /** A word smeared over more than this is a Whisper timing artefact, not speech (spans it invents are dropped separately — `dropUnreliableSpans`). */
  MAX_WORD_SECONDS: 2.5,
  /** 16 kHz mono s16le for a ~2 min window is ~4MB; generous headroom. */
  MAX_PCM_BYTES: 64 * 1024 * 1024,
} as const;

export const MEDIA = {
  /**
   * How long an outgoing `fetch()` in this module may take. Node's global
   * `fetch()` (undici) defaults `headersTimeout`/`bodyTimeout` to 300_000ms
   * (5 min), which is shorter than several things we legitimately do: Gemini
   * reasoning over an hour of audio, a 238MB download on a throttled
   * connection (observed killed mid-stream with ~64MB read, the connection
   * healthy), a Whisper transcription of a long window. Every client that can
   * outlive five minutes builds an undici `Agent` from this — one number, so
   * the three of them cannot drift apart. It is a *client-side outgoing*
   * limit, unrelated to `server.requestTimeout` in `server.ts`, which governs
   * incoming requests.
   */
  OUTBOUND_FETCH_TIMEOUT_MS: 15 * 60 * 1000,
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
  /**
   * How far a finished clip may fall short of its range before it is treated as
   * a failed cut rather than a clip. A dropped stream is invisible otherwise:
   * ffmpeg reads the truncated input as end-of-input and exits 0, so a 28 s
   * range can quietly ship as 13 s, or as audio with no video at all. The
   * slack covers honest rounding (a frame or two) and nothing more.
   */
  CLIP_TRUNCATION_SLACK_RATIO: 0.1,
  CLIP_TRUNCATION_SLACK_SECONDS: 1,
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
   * a guarantee — see video/README.md.
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

export const MEDIA_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const MEDIA_ERROR_MESSAGES = {
  SHARE_NOT_FOUND: "share: no such file",
  SHARE_OUTSIDE_ROOT: "share: path must be under the private media root (a file this backend produced)",
  SHARE_NOT_A_FILE: "share: not a file",
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
  REFRAME_WORKER_MISSING:
    "Speaker reframe worker is not installed on this host (run `pnpm setup:reframe` in backend)",
  REFRAME_WORKER_FAILED: "Speaker reframe worker failed",
  REFRAME_PLAN_INVALID: "Speaker reframe worker returned an unreadable plan",
  REFRAME_NO_PLAN: "Speaker reframe worker kept the centre crop",
  FFMPEG_REFRAME_FAILED: "ffmpeg failed to render the speaker-reframed clip",
  CLIP_TRUNCATED:
    "The clip came out shorter than its range — the source stream dropped mid-download; cut this range again",
  NATURAL_BOUNDARIES_FAILED: "Could not analyse the clip's audio for natural boundaries; kept the requested range",
  CAPTION_ROMANIZE_FAILED: "Could not rewrite captions in Roman script; kept the native script",
  GENERIC: "Media operation failed",
  VERCEL:
    "The cut op needs a persistent host with local disk output (not available on Vercel)",
  LOCAL_PATH_ON_VERCEL:
    "A local filesystem path was given, but this is running on Vercel (no shared filesystem) — pass a URL instead",
  FETCH_NOT_IMAGE:
    "imageOnly was set but the source did not return a real image content-type",
  FETCH_TOO_LARGE: "Downloaded file exceeded maxBytes",
  CAPTION_NO_AUDIO:
    "The source has no audio track, so there is nothing to transcribe — pass `subtitles` explicitly to caption a silent video",
  CAPTION_NO_VIDEO:
    "The source has no video track — captions can only be burned into a video",
  CAPTION_EMPTY:
    "Transcription produced no usable cues (silent or unintelligible audio) — no caption file was written",
  CAPTION_BURN_FAILED: "ffmpeg failed to burn in captions",
  EFFECTS_NO_VIDEO:
    "The source has no video track — a colour grade can only be applied to a video",
  EFFECTS_RENDER_FAILED: "ffmpeg failed to render the graded clip",
  EFFECTS_PREVIEW_FAILED: "ffmpeg failed to build the preset preview sheet",
  EFFECTS_NOTHING_TO_DO:
    "No treatment was asked for — pass at least one of `grade`, `hide` or `logo`, or `preview: true`",
  EFFECTS_LOGO_MISSING: "The logo file does not exist or is not readable",
  EFFECTS_REPLACE_NO_IMAGE:
    "hide.style is \"replace\" but no hide.replaceWith image was given — replace pastes an image over the region, so it needs one",
  EFFECTS_DETECT_FAILED: "Could not sample frames to detect static overlays",
  EFFECTS_SURROUND_FAILED:
    "Could not sample the background colour around the region (too close to the frame edge, or the source would not seek)",
  EFFECTS_DETECT_NONE:
    "No static overlay was found in this clip — pass explicit regions if there is one to cover",
  CAPTION_SUBTITLE_PARSE_FAILED:
    "Could not parse the supplied `subtitles` as SRT or VTT",
} as const;

/** HTTP statuses treated as "this source is blocking a plain fetch" — triggers the TLS-fingerprint fallback in source.ts. */
export const MEDIA_GATED_STATUS_CODES = [401, 403, 429, 503] as const;

/**
 * Extensions `media.fetch` will name a downloaded file with when the
 * response's content-type matches — otherwise the file is left unnamed
 * (no extension), same as always. Deliberately just the common image types:
 * `imageOnly` REQUIRES a match from this set (unmatched = rejected, not
 * just unnamed); a plain fetch only uses it as an opportunistic nicety.
 */
export const MEDIA_FETCH_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MEDIA_CUT_OUTPUT_DIR = AIXEL_MEDIA.MEDIA_CUTS;

export const MEDIA_CAPTION_OUTPUT_DIR = AIXEL_MEDIA.MEDIA_CAPTIONS;

/** `share` — public copies live here; /home/ubuntu/media/prune.sh deletes them after RETENTION_DAYS. */
export const MEDIA_SHARE = {
  PUBLIC_DIR: AIXEL_MEDIA.PUBLIC,
  PUBLIC_BASE_URL: AIXEL_MEDIA.PUBLIC_BASE_URL,
  PUBLIC_RETENTION_DAYS: 7,
} as const;

/**
 * Caption defaults, tuned for a 1080x1920 vertical Short.
 *
 * `position` maps to a libass alignment rather than a raw pixel offset so the
 * common cases stay resolution-independent: `middle` is alignment 5 (true
 * vertical centre, no margin arithmetic), while `lower-third`/`bottom` are
 * alignment 2 (bottom-centre) plus a margin measured up from the bottom edge.
 * Those two margins ARE in source pixels and assume a 1920-tall frame — pass
 * `style.marginV` explicitly for anything else.
 *
 * Why the default is `middle`: YouTube Shorts, Reels and TikTok all overlay
 * their own chrome (title, handle, action rail) across the bottom of the
 * frame. Bottom-anchored captions are the single most common way a clip ships
 * unreadable.
 */
export const MEDIA_CAPTION = {
  DEFAULT_FONT_NAME: "DejaVu Sans",
  /**
   * No default font SIZE: an absolute pixel size that suits 1080x1920 is
   * wrong for every other frame. Omitting `style.fontSize` scales the text to
   * this fraction of the frame height instead (~4.5%, the band commercial
   * Shorts captions sit in). An explicit `fontSize` is honoured verbatim, in
   * real source pixels — see `ass.ts` on why that is now meaningful.
   */
  FONT_SIZE_HEIGHT_RATIO: 0.045,
  DEFAULT_PRIMARY_COLOUR: "#FFFFFF",
  DEFAULT_OUTLINE_COLOUR: "#000000",
  DEFAULT_OUTLINE: 3,
  DEFAULT_SHADOW: 0,
  DEFAULT_BOLD: true,
  DEFAULT_UPPERCASE: false,
  DEFAULT_POSITION: "middle" as const,
  /**
   * `middle` is libass alignment 5 (true vertical centre), so its margin is
   * irrelevant. The other two anchor to the bottom edge (alignment 2) with a
   * margin expressed as a FRACTION OF FRAME HEIGHT, so they hold at any
   * resolution. `style.marginV` overrides with absolute source pixels.
   */
  MARGIN_V_HEIGHT_RATIO: { middle: 0, "lower-third": 0.25, bottom: 0.04, "above-ui": 0.3125 },
  ALIGNMENT_BY_POSITION: { middle: 5, "lower-third": 2, bottom: 2, "above-ui": 2 },
  DEFAULT_PRESET: "lines" as const,
  /** Fonts shipped with the backend (OFL), handed to libass as `fontsdir`. Same depth under src/ and dist/. */
  FONTS_DIR: resolve(__dirname, "../../../assets/fonts"),
  /** ASS BackColour (the shadow's colour) whenever a shadow is drawn: black at 25% transparency. */
  SHADOW_BACK_COLOUR: "&H40000000",
  /**
   * The `chunks` preset: 1–3 heavy uppercase words at a time, the spoken word
   * highlighted, each new chunk sliding up into place. Every value is a
   * default that an explicit `style` field overrides.
   *
   * `above-ui` sits the text bottom at 31% of the frame height from the bottom
   * (y=1320 on 1080x1920): above the handle/caption/subscribe block both Reels
   * (~480px) and Shorts (~380px) draw, and usually on the chest or mic of a
   * speaker-framed crop rather than the face.
   */
  CHUNKS: {
    FONT_NAME: "Anton",
    /** 130px on a 1920-tall frame. */
    FONT_SIZE_HEIGHT_RATIO: 0.068,
    SHADOW: 4,
    BOLD: false,
    UPPERCASE: true,
    POSITION: "above-ui" as const,
    HIGHLIGHT_COLOUR: "#FFE500",
    /** 140px each side on 1080 wide — clear of the Reels/Shorts action rail. */
    MARGIN_H_WIDTH_RATIO: 0.13,
    MAX_WORDS: 3,
    MAX_CHARS: 14,
    /** A pause longer than this starts a new chunk. */
    BREAK_GAP_SECONDS: 0.6,
    HOLD_SECONDS: 0.3,
    MIN_WORD_SECONDS: 0.08,
    /** Whisper can time two words at the same instant; events are stepped apart by this so each still renders. */
    MIN_STEP_SECONDS: 0.02,
    /** Entry: rise from this far below (fraction of height) over ENTRY_MOVE_MS, fading in over ENTRY_FADE_MS. */
    ENTRY_RISE_HEIGHT_RATIO: 0.036,
    ENTRY_MOVE_MS: 110,
    ENTRY_FADE_MS: 70,
  },
  /** Fallback frame size when ffmpeg's banner reported no dimensions. */
  FALLBACK_WIDTH: 1080,
  FALLBACK_HEIGHT: 1920,
  /**
   * No fixed default characters-per-line either: how many characters fit is a
   * function of frame width and font size, and a constant guess overflows the
   * frame the moment either changes. Omitting `wrap.maxCharsPerLine` derives
   * it from the usable width instead.
   *
   * `CHAR_WIDTH_RATIO` is the mean glyph advance as a fraction of font size —
   * ~0.55 for DejaVu Sans Bold and close enough for any humanist sans. It only
   * has to be good enough to pick a line length; `WrapStyle: 0` in the ASS
   * header re-wraps anything that still overflows rather than clipping it.
   */
  CHAR_WIDTH_RATIO: 0.55,
  MARGIN_H_WIDTH_RATIO: 0.05,
  DEFAULT_MAX_LINES_PER_CUE: 2,
  /** Hard bounds so a bad style value can't produce an unrenderable or absurd result. */
  MIN_FONT_SIZE: 8,
  MAX_FONT_SIZE: 200,
  MIN_CHARS_PER_LINE: 8,
  MAX_CHARS_PER_LINE: 120,
  MAX_LINES_PER_CUE: 4,
  /** A cue shorter than this is padded out so a fast line is still readable. */
  MIN_CUE_SECONDS: 0.5,
} as const;

export const MEDIA_CAPTION_POSITIONS = ["middle", "lower-third", "bottom", "above-ui"] as const;

/** `lines`: sentence cues (default). `chunks`: 1–3 words at a time with the spoken word highlighted — see `MEDIA_CAPTION.CHUNKS`. */
export const MEDIA_CAPTION_PRESETS = ["lines", "chunks"] as const;

/** `native`: words in the script Whisper writes (default). `roman`: non-Latin words rewritten in Roman script — see `caption/transliterate.ts`. */
export const MEDIA_CAPTION_SCRIPTS = ["native", "roman"] as const;

/** `caption` with `script: "roman"` — see `caption/transliterate.ts`. */
export const MEDIA_CAPTION_ROMANIZE = {
  /** Words per Gemini call; long lists drift. */
  BATCH_WORDS: 80,
  /** Below this share of words returned, keep the native script rather than mix scripts. */
  MIN_COVERAGE: 0.9,
} as const;

/** One numbered word in, the same number out. The JSON list of `{i, w}` is appended. */
export const MEDIA_CAPTION_ROMANIZE_PROMPT = `You rewrite spoken-word captions in Roman script, the way people in India type Hinglish on social media.

Below is a JSON array of words from a speech transcript, in speaking order, each as {"i": <number>, "w": <word>}. Return {"words": [{"i": <same number>, "roman": <that word rewritten>}, ...]} with exactly one entry per input, keeping each "i". Rewrite each word on its own: never merge two words into one entry, split one word across entries, skip, reorder or translate.

Rules:
- Hindi/Urdu words: common everyday Roman spelling, not academic transliteration — "क्या" -> "kya", "भाई" -> "bhai", "नहीं" -> "nahi", "है" -> "hai", "मैं" -> "main", "ज़िंदगी" -> "zindagi". No diacritics.
- English words written in Devanagari: their normal English spelling — "सीन" -> "scene", "पॉडकास्ट" -> "podcast", "बिज़नेस" -> "business".
- Words already in Latin script, numbers and names you recognise: keep as they are (names in their usual English spelling).
- Keep punctuation attached to a word where it was ("है।" -> "hai.", "क्या?" -> "kya?").

Words:
`;

/** Where `media.fetch` writes a genuine remote download — see AIXEL_MEDIA.MEDIA_FETCHED. */
export const MEDIA_FETCH_DIR = AIXEL_MEDIA.MEDIA_FETCHED;

/** Where `media.effects` writes graded clips and preview sheets. */
export const MEDIA_EFFECTS_OUTPUT_DIR = AIXEL_MEDIA.MEDIA_EFFECTS;

/**
 * The built-in colour looks for `effects` op, each an ordered list of ffmpeg
 * video filters applied in sequence.
 *
 * Parametric rather than `.cube` LUT files on purpose: nothing to license or
 * ship, every value is readable and tunable in this file, and a preset can be
 * adjusted after seeing it on real footage instead of being a black box. The
 * numbers here are a deliberate starting point, not a finished house style —
 * `preview: true` exists precisely so they get judged on real frames and
 * changed.
 *
 * Keep them conservative. A grade that is obvious on a still is usually too
 * strong across a whole clip, and every one of these runs on footage someone
 * else shot and already graded once.
 */
export const MEDIA_GRADE_PRESETS = {
  /** Do-no-harm: the smallest lift that still reads as "treated". */
  neutral: ["eq=contrast=1.06:saturation=1.06:gamma=1.01"],
  /**
   * The social/Shorts default. A CONTRAST look, deliberately hue-neutral: an
   * S-curve that crushes the shadows and lifts the highlights, real
   * sharpening, and only a token saturation lift.
   *
   * It carries no colour of its own on purpose. The first version drove the
   * effect with saturation plus `vibrance`, which on warm-lit skin read as
   * orange and made this preset and `warm` look like the same idea at two
   * strengths. Contrast and colour are the two independent axes available, so
   * one preset gets each.
   */
  punch: [
    "curves=all='0/0 0.25/0.20 0.5/0.5 0.75/0.80 1/1'",
    "eq=saturation=1.10",
    "unsharp=5:5:0.8:5:5:0.0",
  ],
  /**
   * Teal-orange: a COLOUR look. Cool shadows, warm mids and highlights, and
   * almost no contrast of its own so it stays distinguishable from `punch` on
   * the same frame — the split-tone is the whole effect.
   *
   * Most of the warmth sits in the mids and highlights rather than the shadow
   * push, because podcast footage is largely near-black: tint the shadows
   * hard and the tint becomes the whole frame, which reads as `cool` rather
   * than as teal-orange. Warming the subject and leaving the background dark
   * is what makes the split visible.
   */
  warm: [
    "colorbalance=rs=-0.02:bs=0.05:rm=0.03:bm=-0.02:rh=0.10:bh=-0.07",
    "eq=contrast=1.04:saturation=1.06",
  ],
  /** Cold and moody: blue-shifted, desaturated, slightly harder. */
  cool: [
    "colorbalance=bs=0.09:bm=0.05:rh=-0.04",
    "eq=contrast=1.10:saturation=0.82",
  ],
  /**
   * Film. Four things together, because no one of them reads as film alone:
   * a small toe lift with an S above it (so it does not wash out the way a
   * plain lifted-black curve does on footage shot against black), a
   * green-cool shadow / warm highlight split, muted colour, and GRAIN.
   *
   * The grain is what actually sells it. The first version was a lift and a
   * desaturation, and the honest verdict on it was "I don't know if that's
   * film-like or not" — which it was not, because every digital-looking
   * frame is perfectly clean and this one still was. `noise` is temporal
   * (`t`), so it moves frame to frame like real grain instead of sitting
   * there as a fixed dirty overlay.
   *
   * It costs bitrate: grain is by definition incompressible detail, so a
   * graded file comes out larger than the same clip under any other preset.
   */
  film: [
    "curves=all='0/0.03 0.25/0.23 0.75/0.79 1/0.96'",
    "colorbalance=gs=0.02:bs=0.015:rh=0.035:bh=-0.02",
    "eq=contrast=1.02:saturation=0.86",
    "noise=alls=7:allf=t+u",
  ],
  /** High-contrast black and white. A whole-channel identity choice, not a per-clip one. */
  mono: ["hue=s=0", "eq=contrast=1.28:gamma=0.98"],
} as const;

export const MEDIA_GRADE_PRESET_NAMES = [
  "neutral",
  "punch",
  "warm",
  "cool",
  "film",
  "mono",
] as const;

export const MEDIA_EFFECTS = {
  DEFAULT_PRESET: "neutral" as const,
  /**
   * Accepted ranges for the grade overrides. Bounds exist so a typo cannot
   * produce an unwatchable clip: `eq` happily accepts a saturation of 50, and
   * the result is a solid block of colour that still encodes and still uploads.
   */
  GRADE_BOUNDS: {
    CONTRAST: { MIN: 0, MAX: 4 },
    BRIGHTNESS: { MIN: -1, MAX: 1 },
    SATURATION: { MIN: 0, MAX: 3 },
    GAMMA: { MIN: 0.1, MAX: 10 },
    /** Kelvin. Below ~6500 warms, above cools. */
    TEMPERATURE: { MIN: 1000, MAX: 40000 },
    SHARPEN: { MIN: 0, MAX: 2 },
  },
  /** Encode settings, identical to `caption`'s burn — one look for every re-encode this backend does. */
  ENCODE: { preset: "veryfast", crf: "20", pixelFormat: "yuv420p" },
  PREVIEW: {
    /** Tiles per row. 4 keeps a 7-tile sheet (original + 6 presets) to two rows on a phone. */
    COLUMNS: 4,
    /** Each tile's width in pixels; height follows the source's own aspect ratio. */
    TILE_WIDTH: 420,
    /** Fractions of the duration used when `at` is not given. */
    DEFAULT_AT_FRACTIONS: [0.33, 0.66],
    /** Hard ceiling on sheets per call — each one is a full render pass. */
    MAX_FRAMES: 5,
    /** Label band: font size and inset as fractions of the tile width. */
    LABEL_FONT_RATIO: 0.11,
    LABEL_INSET_RATIO: 0.04,
    /** The untreated frame is always tile 0, so there is something to compare against. */
    ORIGINAL_LABEL: "ORIGINAL",
  },
} as const;

export const MEDIA_HIDE_STYLES = ["fill", "blur", "pixelate", "replace"] as const;

/**
 * `replace` is only available on `effects`, never on `cut`.
 *
 * Not an arbitrary limit. `cut` applies its cover through `-vf`, a single-input
 * filtergraph, and pasting an image needs a second input. More importantly it
 * would be the wrong thing there: `cut` covers the source mark BEFORE the
 * reframe crop, and after that crop the place the mark used to sit is often
 * outside the finished frame entirely — so a replacement pasted there would
 * appear and disappear as the crop moves. Replacing in place only makes sense
 * when the frame is not being recropped.
 */
export const MEDIA_HIDE_STYLES_ON_CUT = ["fill", "blur", "pixelate"] as const;

/** Where `effects.logo` anchors the mark. */
export const MEDIA_LOGO_POSITIONS = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
] as const;

/**
 * `effects.hide` — cover a region of every frame (a creator's bug, a sponsor
 * ident, a broadcaster watermark).
 *
 * Auto-detection is temporal: an overlay sits still while the footage behind
 * it changes, so a per-pixel standard deviation across frames sampled over the
 * whole clip is near zero exactly where an overlay is burned in.
 *
 * Staticness alone is not enough, and this is the part that matters. Podcast
 * footage is mostly a locked-off camera against a dark background, so half the
 * frame is static too — and a plain variance threshold selects the background,
 * not the logo. A logo is static AND *structured*: it has hard edges, because
 * it is a graphic rather than a flat wall. Requiring both is what separates
 * them, and it is why `MIN_GRADIENT` is not optional.
 */
export const MEDIA_HIDE = {
  DEFAULT_STYLE: "fill" as const,
  BOUNDS: {
    /** Regions accepted per `effects` call. */
    MAX_REGIONS: 6,
    /** Regions accepted per `cut` call — a source carries fewer burned-in marks than a finished clip. */
    MAX_REGIONS_ON_CUT: 4,
    STRENGTH: { MIN: 0.02, MAX: 1 },
  },
  /** Seconds of unframed source `cut` probes to find the logo and sample its background. */
  PROBE_SECONDS: 10,
  /** Blur radius / pixel block, as a fraction of the region's smaller side. */
  DEFAULT_STRENGTH: 0.25,
  /**
   * `style: "fill"` — paint the region flat in the colour of the background
   * immediately around it. On a plain set this is invisible, where a blur
   * still reads as a smudge someone put there deliberately.
   *
   * It is gated on two measurements (see `surround.ts`) because a flat patch
   * over a background that is NOT flat looks worse than any blur.
   */
  SURROUND: {
    /** Frames sampled when measuring the surrounding colour. */
    FRAMES: 6,
    EDGE_SKIP_FRACTION: 0.05,
    /**
     * Ring thickness sampled outside the region, as a fraction of its shorter
     * side. Deliberately THIN: what decides whether a flat patch is visible is
     * the seam at the box edge, so the pixels that matter are the ones
     * immediately outside it. A thick ring reaches past the background into
     * whatever else is nearby and rejects fills that would have been perfect.
     */
    RING_FRACTION: 0.12,
    MIN_RING_PX: 8,
    /**
     * Gap left between the region and the ring. Logo edges are anti-aliased and
     * often carry a soft glow, so sampling flush against the box averages the
     * logo's own colour into the patch we are about to paint.
     */
    SAFETY_FRACTION: 0.06,
    MIN_SAFETY_PX: 4,
    /** Fewest ring pixels worth trusting a median from. */
    MIN_SAMPLE_PIXELS: 400,
    /**
     * A pixel within this distance of the median (per channel) agrees with it.
     *
     * Consensus, not standard deviation, is the gate. Stddev is the wrong test:
     * one bright corner clipping into the sampling ring drags it far above any
     * sane threshold even when the entire seam is a single flat colour, and it
     * rejected a fill that would have been invisible. `spread` is still
     * reported, as a diagnostic only.
     */
    CONSENSUS_TOLERANCE: 10,
    /** Share of ring pixels that must agree with the median for a flat patch to disappear. */
    MIN_CONSENSUS: 0.8,
    /** Per-channel movement of the median across frames, above which one colour cannot follow it. */
    MAX_DRIFT: 10,
  },
  DETECT: {
    /** Frames sampled across the clip. More is steadier and linearly slower. */
    FRAMES: 12,
    /** Ignore the first/last 5%: intros, fades and end cards are not representative. */
    EDGE_SKIP_FRACTION: 0.05,
    /** Analysis width; height follows the source aspect. Small on purpose — a logo is many pixels even here. */
    WIDTH: 320,
    /** Per-pixel temporal stddev (0-255) at or below which a pixel counts as static. */
    STATIC_MAX_STDDEV: 4.0,
    /** Spatial gradient at or above which a static pixel counts as structured rather than flat wall. */
    MIN_GRADIENT: 16,
    /**
     * The weaker gradient used to GROW a region once it has been found.
     *
     * Two thresholds, like edge detection: the strong one decides what is a
     * region at all, the weak one decides how far that region really extends.
     * A mark is rarely uniformly contrasty — a sponsor strip's faintest rows,
     * or the soft edge of a glow, sit below the strong threshold and get left
     * behind, which is what made a blanket padding necessary before.
     *
     * Growing on the weak threshold instead gives a box that follows the mark's
     * actual extent. That matters because these boxes get covered: too small
     * leaves a sliver of someone else's logo, too large eats the frame around
     * it — and on podcast footage the thing next to the logo is usually a face.
     */
    GROW_GRADIENT: 12,
    /** A row/column must hold at least this share of weak-mask pixels to keep growing. */
    GROW_MIN_SHARE: 0.25,
    /** Hard stop, as a fraction of the region's own size, so growth cannot run away. */
    GROW_MAX_FRACTION: 0.25,
    /**
     * Dilation radius, as a fraction of the analysis width.
     *
     * Small on purpose. Its job is to bridge a gap between parts of one mark
     * (a logo and the sponsor strip under it); it is not a coverage mechanism.
     * Measured on real footage, a radius of 6 analysis pixels grew the box by
     * 72 source pixels on every edge and reached the top of the frame, while
     * the mark's own mask rows were already contiguous and needed no bridging
     * at all.
     */
    DILATE_FRACTION: 0.006,
    /** A region's bounding box, as a fraction of frame area. Below: noise. Above: not an overlay. */
    MIN_AREA_FRACTION: 0.0006,
    MAX_AREA_FRACTION: 0.15,
    /** An overlay hugs an edge. The box's nearest-edge gap must be under this fraction of that dimension. */
    MAX_EDGE_GAP_FRACTION: 0.15,
    /**
     * A logo is COMPACT. These two reject the thing that otherwise looks
     * identical to one: the edge of a letterbox bar.
     *
     * Where a black cinemascope bar meets the picture there is a perfectly
     * static, hard-edged line — maximum staticness, high gradient, hugging a
     * frame edge. It passes every other test here. Measured on real 2.39:1
     * footage it produced three "logos" (1918x102, 940x102, 324x102, all
     * confidence 0.74-0.81) which would have been blurred as bands straight
     * across the shot.
     *
     * A box spanning more than half a dimension is not a bug, and neither is
     * one more than 3x longer than it is tall. Known limitation: a channel
     * whose bug is ONLY a wide strip would be missed — pass explicit regions
     * for that rather than loosening these.
     */
    MAX_EXTENT_FRACTION: 0.5,
    MAX_ASPECT: 3,
    /**
     * Grow each detected box by this fraction of its size. Anti-aliased logo
     * edges sit just outside the mask, and a bug is often a lock-up plus a
     * sponsor strip whose faintest row falls below the gradient threshold —
     * measured on a real clip, a tight box left a visible sliver of the strip
     * behind. Generous padding is nearly free for `fill` (the extra area is
     * the same flat colour) and only mildly costly for `blur`.
     */
    PAD_FRACTION: 0.03,
    /** Most regions returned, highest confidence first. */
    MAX_REGIONS: 3,
    /**
     * How many auto-detected regions `style: "replace"` will actually use.
     *
     * One. Covering several regions is reasonable when erasing — blur or fill
     * every candidate and a false positive costs a smudge on something already
     * static. Replacing is different: each region gets OUR mark pasted into it,
     * so a false positive is our logo stamped somewhere absurd. A source
     * carries one bug, so take the best-scoring region and leave the rest.
     * Explicit regions are unaffected — a caller asking for three means three.
     */
    MAX_REGIONS_ON_REPLACE: 1,
    /** Below this, a region is reported but NOT blurred unless the caller asked for it by name. */
    MIN_CONFIDENCE: 0.35,
    /**
     * The much higher bar `style: "replace"` must clear.
     *
     * Erasing a weak candidate is cheap — a blur over something already static
     * is invisible. PASTING OUR MARK onto one is not: it puts the channel's
     * logo in a random place on someone else's video.
     *
     * The gap is wide and measurable. Real burned-in marks scored 0.93-0.97
     * across every source tested; the best noise region scored 0.79, and on a
     * Joe Rogan episode — which carries no bug at all — the top "detection" was
     * an empty patch of dark table that would have been stamped with our logo.
     * A source with no mark must produce NO replacement, and the corner mark
     * brands the clip on its own, so refusing here costs nothing.
     */
    MIN_CONFIDENCE_ON_REPLACE: 0.85,
  },
} as const;

export const MEDIA_LOGO = {
  DEFAULT_POSITION: "top-right" as const,
  /**
   * Chroma-key tolerance when a logo file has no alpha of its own (a JPEG
   * avatar, say). `auto` samples the image's own corner pixel — right for a
   * mark drawn on a flat background, wrong for a photograph.
   */
  KEY: { SIMILARITY: 0.12, BLEND: 0.05 },
  BOUNDS: {
    SCALE: { MIN: 0.01, MAX: 1 },
    OPACITY: { MIN: 0, MAX: 1 },
    MARGIN: { MIN: 0, MAX: 0.4 },
  },
  /** Mark width as a fraction of the frame width. */
  DEFAULT_SCALE: 0.14,
  DEFAULT_OPACITY: 0.9,
  /** Inset from the frame edges, as a fraction of frame width. */
  DEFAULT_MARGIN: 0.04,
} as const;
