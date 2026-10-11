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
  PROVIDERS: ["kokoro"] as const,
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
  MAX_TEXT_CHARS: 2000,
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

export const MEDIA_NARRATE_ERRORS = {
  ENGINE_UNREACHABLE:
    "The narration engine (Kokoro) is not reachable. Start the kokoro container (docker start kokoro-test) or set KOKORO_URL",
  ENGINE_FAILED: "The narration engine failed to synthesise the text",
  ENGINE_EMPTY: "The narration engine returned no audio",
  EMPTY_TEXT: "Nothing to narrate: the text is empty after cleaning",
  FFMPEG_FAILED: "ffmpeg failed to repair the narration audio",
} as const;
