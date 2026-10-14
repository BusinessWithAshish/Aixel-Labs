/**
 * `media` op=narrate — text to narration audio plus word timings.
 *
 * The engine is a self-hosted Kokoro-FastAPI container (see
 * `MEDIA_NARRATE.KOKORO_URL`). Every number below was measured against it, not
 * taken from its docs; the comments say where each one comes from.
 */
export const MEDIA_NARRATE = {
  /** Kokoro-FastAPI base URL. One container, one box: loopback by default. */
  KOKORO_URL: process.env.KOKORO_URL || "http://127.0.0.1:8880",
  PROVIDERS: ["kokoro", "gemini"] as const,
  DEFAULT_PROVIDER: "kokoro" as const,
  /** Kokoro language code for Hindi; the voices `hf_*`/`hm_*` are the Hindi set. */
  LANG_CODE: { hi: "h", en: "a" } as Record<string, string>,
  DEFAULT_LANGUAGE: "hi",
  DEFAULT_VOICE: "hm_omega",
  DEFAULT_SPEED: 1.0,
  SPEED_MIN: 0.5,
  SPEED_MAX: 2.0,
  /** A 90 s script takes about a minute of the four cores; a hung container should not hold a request forever. */
  REQUEST_TIMEOUT_MS: 5 * 60 * 1000,
  /** One synthesis at a time: it already uses ~3 of the 4 cores, and two at once only make both slower. */
  MAX_CONCURRENT: 1,
  /** A whole 90 s Hindi script is ~1,500 characters; `gemini` takes the whole script in one call. */
  MAX_TEXT_CHARS: 4000,
  /**
   * Kokoro adds ~0.38 s of its own silence to every `[pause:Ns]` tag (a chunk
   * boundary: ~0.05 s lead + ~0.3 s trail). A caller asking for a 0.6 s pause
   * wants 0.6 s, so the tag is shortened by this much.
   */
  PAUSE_TAG_OVERHEAD_SECONDS: 0.38,
  /** Below this the tag would be pointless; the surrounding punctuation already gives ~0.4 s. */
  PAUSE_TAG_MIN_SECONDS: 0.05,
  PAUSE_MAX_SECONDS: 10,
  /** Phrase size for footage matching — see `phrases.ts`. */
  PHRASE_MIN_WORDS: 2,
  PHRASE_MAX_WORDS: 4,
} as const;

/**
 * provider "gemini" — Google's Gemini TTS through the Interactions API, on the
 * shared free key pool (`GEMINI_API_KEY_FREE`).
 *
 * Free tier, measured 2026-10-14 from Google's own 429 bodies: 3 requests a
 * minute and 10 a day per Google project per model. One request voices a whole
 * script (up to ~655 s of audio), so a recap is ONE call, never one per sentence.
 */
export const MEDIA_NARRATE_GEMINI = {
  URL: "https://generativelanguage.googleapis.com/v1beta/interactions",
  /** GA since 2026-09-22. The *-preview-tts models shut down from 2026-11-17. */
  MODEL: "gemini-3.8-flash-tts",
  /** A studio voice (Charon, Puck, ...) or an extended-library id (e.g. en-in-storyteller-11). */
  DEFAULT_VOICE: "Charon",
  REQUEST_TIMEOUT_MS: 3 * 60 * 1000,
  /** `{pause s}` becomes one of Gemini's own pause tags; at or above this it is the long one. */
  LONG_PAUSE_SECONDS: 0.8,
  /**
   * Gemini returns audio only. Word times come from Whisper on that audio,
   * matched back to the script's own words. large-v3 hears Hindi better than turbo.
   */
  TIMING_MODEL: "whisper-large-v3" as const,
  /** Whisper is heard in pieces no longer than this, cut in pauses (it drops words past ~30 s). */
  HEARING_CHUNK_SECONDS: 20,
  PAUSE_NOISE_DB: -35,
  PAUSE_MIN_SECONDS: 0.2,
  /** Two words count as the same when their character-bigram overlap (Dice) is at least this. */
  MATCH_MIN_SIMILARITY: 0.5,
} as const;

export const MEDIA_NARRATE_ERRORS = {
  ENGINE_UNREACHABLE:
    "The narration engine (Kokoro) is not reachable. Start the kokoro container (docker start kokoro-test) or set KOKORO_URL",
  ENGINE_FAILED: "The narration engine failed to synthesise the text",
  ENGINE_EMPTY: "The narration engine returned no audio",
  EMPTY_TEXT: "Nothing to narrate: the text is empty after cleaning",
  FFMPEG_FAILED: "ffmpeg failed to repair the narration audio",
  GEMINI_FAILED: "Gemini TTS failed to synthesise the text",
  GEMINI_EMPTY: "Gemini TTS returned no audio",
  SPLIT_FAILED: "ffmpeg failed to split the narration into sentences",
} as const;
