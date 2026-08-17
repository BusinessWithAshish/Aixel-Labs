/**
 * Tightening — single source of truth for silence-detection thresholds, the
 * filler dictionary, ffmpeg encode settings, and safety caps. Nothing in
 * silence/fillers/ranges/assemble should hardcode these values.
 */

export const TIGHTENING_FIELD_DESCRIPTIONS = {
  videoSource:
    "Local filesystem path to the source VIDEO to tighten (this pipeline runs on the VPS and reads/writes files directly off disk), or a publicly-reachable video URL.",
  silenceThresholdDb:
    "Loudness at or below which audio counts as silence, in dBFS (negative). Closer to 0 (e.g. -20) is aggressive and will start eating quiet speech; further from 0 (e.g. -45) only removes near-total silence. Default -30 works for typical spoken-word recordings.",
  minSilenceSeconds:
    "A silent stretch must last at least this long to be considered removable at all. Below ~0.3 you start cutting the natural micro-pauses between words, which is what makes tightened audio sound machine-gunned.",
  keepPaddingSeconds:
    "How much of each removed silence to LEAVE IN at both ends. This is the knob that keeps the result sounding human — a pause is shortened to roughly 2x this value rather than deleted outright.",
  removeFillers:
    "Whether to also cut filler words (uh, um, er, ...) using word-level transcript timestamps. Set false to remove silences only.",
  fillerWords:
    "Optional override for the filler dictionary. Matching is case-insensitive, ignores punctuation, and collapses repeated letters (so 'uhhh' matches 'uh'), so list base forms only.",
  language:
    "Optional ISO-639-1 language code passed to the transcriber to improve accuracy (e.g. 'en'). Note the default filler dictionary is English-only.",
} as const;

/**
 * Whisper is trained to produce clean, readable prose and will silently drop
 * disfluencies from its transcript — you cannot cut an "um" the model never
 * emitted. Seeding the decoder prompt with a disfluency-dense sample biases it
 * toward verbatim output. This measurably improves filler recall but does not
 * make it complete: expect the majority of fillers, not all of them.
 */
export const TIGHTENING_VERBATIM_PROMPT =
  "Umm, so, uh, like, I mean... you know, er, it's, uhh, kind of, hmm, ah, yeah, so, um.";

/**
 * Default filler dictionary, in COLLAPSED form — `normalizeWord` in
 * `fillers.ts` strips punctuation, lowercases, and squeezes runs of a repeated
 * letter down to one, so "Uhhh," / "UM." / "hmmm" all arrive here as "uh" /
 * "um" / "hm". List base forms only.
 *
 * Deliberately limited to pure disfluencies. Discourse markers ("like",
 * "actually", "basically", "you know") are NOT here: they're filler often
 * enough to be tempting, but they're also load-bearing English words, and
 * cutting a real "like" mid-sentence is a far worse artifact than leaving a
 * filler in. Callers who want them can pass `fillerWords` explicitly.
 */
export const TIGHTENING_DEFAULT_FILLER_WORDS = [
  "uh",
  "um",
  "er",
  "erm",
  "ah",
  "hm",
  "eh",
  "mhm",
] as const;

export const TIGHTENING = {
  /** Silence detection defaults — see the field descriptions above for what each does. */
  DEFAULT_SILENCE_THRESHOLD_DB: -30,
  DEFAULT_MIN_SILENCE_SECONDS: 0.4,
  DEFAULT_KEEP_PADDING_SECONDS: 0.15,

  /** Validation bounds. Outside these the output is reliably bad, so reject rather than produce garbage. */
  MIN_SILENCE_THRESHOLD_DB: -60,
  MAX_SILENCE_THRESHOLD_DB: -10,
  MIN_MIN_SILENCE_SECONDS: 0.15,
  MAX_MIN_SILENCE_SECONDS: 5,
  MAX_KEEP_PADDING_SECONDS: 1,

  /**
   * Two removals separated by less than this are merged into one. A sliver of
   * kept audio this short between two cuts isn't content — it's an audible
   * click and a wasted keyframe.
   */
  BRIDGE_GAP_SECONDS: 0.08,

  /** A removal shorter than this isn't worth a cut — the edit artifact costs more than the time saved. */
  MIN_REMOVAL_SECONDS: 0.06,

  /**
   * Guard band left at each end of a filler word before cutting it. Whisper
   * reports word boundaries as a single shared timestamp between adjacent
   * words (word[i].end === word[i+1].start) with ~±100ms of real uncertainty,
   * so cutting exactly on that boundary risks clipping the tail of the word
   * before or the onset of the word after. Trimming inward by this much means
   * a misplaced boundary eats the filler instead.
   *
   * The guard is additionally capped at `FILLER_GUARD_MAX_FRACTION` of the
   * filler's own length. Without that cap a fixed 30ms-per-side guard erases
   * short fillers entirely — measured against real Whisper output, a 0.10s
   * "uh" shrank to 0.04s and fell below `MIN_REMOVAL_SECONDS`, so the filler
   * survived in the output. Scaling the guard keeps ~70-85% of every filler
   * cut regardless of how long it is.
   */
  FILLER_INWARD_GUARD_SECONDS: 0.03,
  FILLER_GUARD_MAX_FRACTION: 0.15,

  /**
   * Hard ceiling on the number of cut ranges in one render. The ffmpeg
   * `select` expression is evaluated per frame, so its cost scales with this;
   * past a few thousand terms the filtergraph parse itself becomes the
   * bottleneck. Exceeding the cap degrades gracefully — `ranges.ts` keeps the
   * LONGEST removals (the ones that actually buy runtime) and drops the rest —
   * rather than failing the request.
   */
  MAX_CUT_RANGES: 2000,

  /**
   * ffmpeg encode settings. Tightening always re-encodes: `select` + `setpts`
   * rewrites the presentation timestamps of every frame, so stream-copy isn't
   * an option regardless of where the cuts land.
   */
  FFMPEG_VIDEO_CODEC: "libx264",
  FFMPEG_AUDIO_CODEC: "aac",
  FFMPEG_PRESET: "veryfast",
  FFMPEG_CRF: "20",

  /** Transcription is only ever a means to word timestamps here, so pin the fast model. */
  TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
} as const;

export const TIGHTENING_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  DOWNLOAD_FAILED: "Failed to download source video",
  FFMPEG_FAILED: "ffmpeg failed",
  PROBE_FAILED: "Could not read the source video's duration",
  SILENCE_DETECT_FAILED: "Silence detection failed",
  NO_WORD_TIMESTAMPS:
    "The transcriber returned no word-level timestamps, so filler words cannot be located — retry with removeFillers: false to do silence removal only",
  NOTHING_TO_CUT: "No removable silence or filler was found in this video",
  OUTPUT_WRITE_FAILED: "Failed to write the tightened video to disk",
  GENERIC: "Tightening failed",
} as const;
