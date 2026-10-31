/** Routes under `ENDPOINTS.LINE_FINDER`. Stateless: saving and searching live in `frontend/server/line-finder`. */
export const LINE_FINDER_API_ROUTES = {
  DISCOVER: "/discover",
  CAPTIONS: "/captions",
  CHECK_SPEAKER: "/check-speaker",
} as const;

export const LINE_FINDER_LIMITS = {
  LINE_MAX_LENGTH: 200,
  NAME_MAX_LENGTH: 80,
  SPELLINGS_MAX: 8,
  HANDLE_MAX_LENGTH: 100,
  /** Videos collected per person, most viewed first. */
  VIDEOS_PER_PERSON: 200,
  /** Results per YouTube search while finding a person's videos. */
  DISCOVERY_RESULTS_PER_QUERY: 40,
  /** Tested at this on 108 videos: none refused, and the caption files never needed the proxy. */
  CAPTION_CONCURRENCY: 6,
  /** Words read by the speaker check, so one call stays inside the AI provider's limits. */
  SPEAKER_CONTEXT_MAX_LENGTH: 4_000,
  /** Failures in a row before collection stops itself. */
  STOP_AFTER_FAILURES: 10,
  CANDIDATES: 400,
  RESULTS: 20,
  /** Windows closer than this in one video count as one moment. */
  SAME_MOMENT_MS: 10_000,
  /** The speaker check runs on this many results per search. */
  SPEAKER_CHECKS_PER_SEARCH: 8,
  /** A search gives up waiting for the check after this and shows Not checked. */
  SPEAKER_CHECK_BUDGET_MS: 20_000,
  /** Captions read on each side of the match by the speaker check. */
  SPEAKER_CONTEXT_MS: 30_000,
} as const;

/** Spec §4: how close a line's words are. */
export const LINE_FINDER_SCORE = {
  CLOSE: 0.75,
  SIMILAR: 0.45,
  SIMILAR_MIN_WORDS: 2,
  EVERYDAY_WORD_WEIGHT: 0.4,
  /** Fuzzy matching only applies to words at least this long. */
  FUZZY_MIN_LENGTH: 4,
  /** How far past the matched words a "no" still changes the meaning: right after exact words, or nearby for looser ones. */
  NEGATION_REACH_EXACT: 1,
  NEGATION_REACH_LOOSE: 4,
} as const;

/** Spec §5: the moment plays from a little before the first word to a little after the last. */
export const LINE_FINDER_PLAYER = {
  LEAD_IN_MS: 2_000,
  LEAD_OUT_MS: 6_000,
} as const;

export const LINE_FINDER_MATCH_KIND = {
  EXACT: "exact",
  CLOSE: "close",
  SIMILAR: "similar",
} as const;

export const LINE_FINDER_SPEAKER = {
  CONFIRMED: "confirmed",
  LIKELY: "likely",
  SOMEONE_ELSE: "someone_else",
  UNSURE: "unsure",
  NOT_CHECKED: "not_checked",
} as const;

export const LINE_FINDER_SEARCH_STATE = {
  FOUND: "found",
  CLOSEST: "closest",
  NOT_FOUND: "not_found",
  NOT_COLLECTED: "not_collected",
} as const;

export const LINE_FINDER_VIDEO_STATUS = {
  PENDING: "pending",
  DONE: "done",
  NO_CAPTIONS: "no_captions",
  FAILED: "failed",
} as const;

export const LINE_FINDER_PERSON_STATUS = {
  /** Added, nothing collected yet. */
  NEW: "new",
  COLLECTING: "collecting",
  /** Stopped itself; `stopReason` says why. */
  PAUSED: "paused",
  DONE: "done",
} as const;

/** Added to each search for a person's name. Short clips (`meme`, `shorts`) are where famous lines live. */
export const LINE_FINDER_DISCOVERY_SUFFIXES = ["", "interview", "podcast", "meme", "shorts"] as const;

/** Tried in order. Hindi first because that's the launch audience. */
export const LINE_FINDER_CAPTION_LANGUAGES = ["hi", "en"] as const;

export const LINE_FINDER_COUNTRY = "IN";

/** The sound forms of words that say no (spec §4.5). */
export const LINE_FINDER_NEGATIONS: ReadonlySet<string> = new Set(["nahi", "nai", "mat"]);

/** Sound forms of everyday words, which count for less in a match. */
export const LINE_FINDER_EVERYDAY_WORDS: ReadonlySet<string> = new Set([
  "a", "aur", "bi", "ek", "hai", "hu", "hun", "ho", "is", "ka", "ke", "ki", "ko", "kya", "main", "me",
  "mera", "mere", "meri", "mujhe", "ne", "par", "pe", "se", "tha", "the", "thi", "to", "tu", "tum", "us", "vo", "ye",
]);

export const LINE_FINDER_STOP_REASONS = {
  REFUSED: "YouTube is refusing right now. Try again later.",
  BUDGET: "Daily proxy limit reached. Try again tomorrow.",
} as const;

export const LINE_FINDER_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  PERSON_NOT_FOUND: "Person not found",
  NO_ACCESS: "You don't have access to LineFinder",
  SPEAKER_CHECK_FAILED: "Speaker check failed",
} as const;

export const LINE_FINDER_HANDLER_LABEL = "[line-finder]";

export const LINE_FINDER_CAPTIONS_OUTCOME = {
  OK: "ok",
  NO_CAPTIONS: "no_captions",
  FAILED: "failed",
  /** The daily proxy limit is spent, so the worker should stop rather than count a failure. */
  BUDGET: "budget",
} as const;
