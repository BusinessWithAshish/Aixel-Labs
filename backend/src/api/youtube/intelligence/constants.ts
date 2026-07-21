import { YOUTUBE_CHANNEL_TIER, YOUTUBE_DURATION_BUCKET } from "../constants";

// ─── Intelligence route paths (method is always POST) ────────────────────────

export const YOUTUBE_INTELLIGENCE_ROUTES = {
  SEARCH: "/intelligence/search",
  VIDEO: "/intelligence/video",
  VIDEO_SUGGESTED: "/intelligence/video/suggested",
  VIDEO_TRANSCRIPT: "/intelligence/video/transcript",
  CHANNEL: "/intelligence/channel",
  HANDLE: "/intelligence/handle",
  SUGGEST: "/intelligence/suggest",
} as const;

// ─── Handler labels (logging + error messages) ───────────────────────────────

export const YOUTUBE_INTELLIGENCE_HANDLER_LABELS = {
  SEARCH: "YOUTUBE/INTELLIGENCE/SEARCH",
  VIDEO: "YOUTUBE/INTELLIGENCE/VIDEO",
  VIDEO_SUGGESTED: "YOUTUBE/INTELLIGENCE/VIDEO/SUGGESTED",
  VIDEO_TRANSCRIPT: "YOUTUBE/INTELLIGENCE/VIDEO/TRANSCRIPT",
  CHANNEL: "YOUTUBE/INTELLIGENCE/CHANNEL",
  HANDLE: "YOUTUBE/INTELLIGENCE/HANDLE",
  SUGGEST: "YOUTUBE/INTELLIGENCE/SUGGEST",
} as const;

// ─── Time ────────────────────────────────────────────────────────────────────

export const MS_PER_DAY = 86_400_000;

export const YOUTUBE_RECENT_UPLOAD_WINDOW_DAYS = {
  RECENT: 30,
  EXTENDED: 90,
} as const;

export const YOUTUBE_DECAY_VELOCITY_BASE_DAYS = 30;

// ─── Duration classification (seconds) ───────────────────────────────────────

export const YOUTUBE_SHORT_MAX_SECONDS = 60;

export const YOUTUBE_DURATION_THRESHOLDS_SECONDS = {
  SHORTS_MAX_EXCLUSIVE: YOUTUBE_SHORT_MAX_SECONDS,
  SHORT_MAX_EXCLUSIVE: 300,
  MID_MAX_EXCLUSIVE: 1200,
} as const;

export const YOUTUBE_DURATION_BUCKET_ORDER = [
  YOUTUBE_DURATION_BUCKET.SHORTS,
  YOUTUBE_DURATION_BUCKET.SHORT,
  YOUTUBE_DURATION_BUCKET.MID,
  YOUTUBE_DURATION_BUCKET.LONG,
] as const;

// ─── Channel tier classification (subscribers) ───────────────────────────────

export const YOUTUBE_CHANNEL_TIER_THRESHOLDS_SUBSCRIBERS = {
  MICRO_MAX_EXCLUSIVE: 10_000,
  SMALL_MAX_EXCLUSIVE: 100_000,
  MID_MAX_EXCLUSIVE: 1_000_000,
} as const;

export const YOUTUBE_CHANNEL_TIER_ORDER = [
  YOUTUBE_CHANNEL_TIER.MICRO,
  YOUTUBE_CHANNEL_TIER.SMALL,
  YOUTUBE_CHANNEL_TIER.MID,
  YOUTUBE_CHANNEL_TIER.LARGE,
] as const;

// ─── Recent velocity trend ───────────────────────────────────────────────────

export const YOUTUBE_RECENT_VELOCITY_TREND = {
  ACCELERATING: "accelerating",
  STABLE: "stable",
  DECELERATING: "decelerating",
} as const;

export const YOUTUBE_RECENT_VELOCITY_TREND_RATIOS = {
  ACCELERATING: 1.1,
  DECELERATING: 0.9,
} as const;

// ─── Percentile levels ───────────────────────────────────────────────────────

export const YOUTUBE_PERCENTILE_LEVELS = {
  P25: 0.25,
  P50: 0.5,
  P75: 0.75,
  P90: 0.9,
} as const;

// ─── Text patterns ───────────────────────────────────────────────────────────

export const YOUTUBE_INTELLIGENCE_PATTERNS = {
  HASHTAG: /#[\w-]+/g,
  /** 4-digit year (1900–2099) — used by title analysis and suggest intelligence. */
  TITLE_YEAR: /\b(19|20)\d{2}\b/,
  TITLE_HAS_NUMBER: /\d/,
  TITLE_HAS_QUESTION: /\?/,
  TITLE_WORDS: /\s+/,
  CHANNEL_KEYWORDS: /"([^"]+)"|(\S+)/g,
  CHANNEL_JOINED_DATE_PREFIX: /^Joined\s+/i,
  /** Unicode letter/number tokeniser for suggest + transcript keyword extraction. */
  WORD_TOKEN: /[^\p{L}\p{N}'-]+/gu,
  /** ASCII-oriented tokeniser used by transcript keyword frequency. */
  ASCII_WORD_SPLIT: /[^a-z0-9'-]+/i,
  ASCII_WORD_STRIP: /[^a-z0-9'-]/gi,
  /** Proper-noun / brand detection — word starts with an uppercase letter. */
  PROPER_NOUN_START: /^\p{Lu}/u,
  /** Pure numeric token (skip in brand detection). */
  PURE_NUMBER: /^\d+$/,
} as const;

/** Shared English stop words for suggest clustering, brand detection, and transcript keywords. */
export const YOUTUBE_INTELLIGENCE_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with",
  "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
  "do", "does", "did", "this", "that", "these", "those", "it", "its", "as",
  "at", "by", "from", "up", "down", "out", "if", "then", "than", "so", "not",
  "no", "yes", "you", "your", "i", "we", "they", "he", "she", "him", "her",
  "my", "our", "their", "me", "us", "them", "what", "which", "who", "whom",
  "when", "where", "why", "how", "all", "any", "both", "each", "few", "more",
  "most", "other", "some", "such", "only", "own", "same", "very", "just",
  "can", "will", "should", "would", "could", "may", "might", "must", "shall",
  "about", "into", "over", "under", "again", "here", "there", "vs", "vs.",
  "full", "video", "videos", "song", "songs", "movie", "movies", "official",
  "best", "top", "new",
]);

/** @deprecated Alias — use `YOUTUBE_INTELLIGENCE_STOP_WORDS`. */
export const YOUTUBE_SUGGEST_STOP_WORDS = YOUTUBE_INTELLIGENCE_STOP_WORDS;

// ─── Suggest intelligence ──────────────────────────────────────────────────────

/** Maximum recursion depth for the niche keyword tree (0 = seed only, 1 = one level deep). */
export const YOUTUBE_SUGGEST_INTELLIGENCE_MAX_DEPTH = 1;

/**
 * Known language / country modifier tokens that signal a localized sub-niche
 * when they appear as whole words in a suggestion. Lower-cased for matching.
 */
export const YOUTUBE_SUGGEST_LANGUAGE_MODIFIERS = [
  "hindi", "spanish", "english", "telugu", "tamil", "bengali", "marathi",
  "punjabi", "malayalam", "kannada", "gujarati", "urdu", "arabic", "french",
  "german", "portuguese", "italian", "russian", "japanese", "korean",
  "chinese", "mandarin", "cantonese", "indonesian", "thai", "vietnamese",
  "turkish", "dutch", "polish", "swedish", "uk", "us", "usa", "india",
  "america", "british", "american", "canadian", "australian", "pakistani",
  "bangladeshi", "nepali", "srilankan", "filipino", "malay", "african",
  "nigerian", "ghanaian", "kenyan", "european", "europe", "asia", "asian",
  "latino", "latina", "mexican", "brazilian", "argentinian",
] as const;

/** Minimum cluster size for a keyword cluster to be reported. */
export const YOUTUBE_SUGGEST_MIN_CLUSTER_SIZE = 3;

/** Maximum number of clusters to return. */
export const YOUTUBE_SUGGEST_MAX_CLUSTERS = 15;

/** N-gram sizes used when building keyword clusters. */
export const YOUTUBE_SUGGEST_CLUSTER_NGRAM_SIZES = [2, 3] as const;

// ─── Transcript intelligence ───────────────────────────────────────────────────

export const YOUTUBE_TRANSCRIPT_HOOK_TYPE = {
  QUESTION: "question",
  BOLD_CLAIM: "bold_claim",
  STORY: "story",
  DIRECT_ADDRESS: "direct_address",
  SHOCK_STAT: "shock_stat",
  DEMONSTRATION: "demonstration",
  STANDARD: "standard",
} as const;

export const YOUTUBE_TRANSCRIPT_ZONE = {
  INTRO: "intro",
  EARLY: "early",
  MID: "mid",
  OUTRO: "outro",
} as const;

/** Zone order for iteration / response shaping. */
export const YOUTUBE_TRANSCRIPT_ZONE_ORDER = [
  YOUTUBE_TRANSCRIPT_ZONE.INTRO,
  YOUTUBE_TRANSCRIPT_ZONE.EARLY,
  YOUTUBE_TRANSCRIPT_ZONE.MID,
  YOUTUBE_TRANSCRIPT_ZONE.OUTRO,
] as const;

/** Zone boundaries as fractions of total duration. */
export const YOUTUBE_TRANSCRIPT_ZONE_BOUNDARIES = {
  INTRO_END: 0.15,
  EARLY_END: 0.35,
  MID_END: 0.8,
} as const;

export const YOUTUBE_TRANSCRIPT_CTA_TYPE = {
  SUBSCRIBE: "subscribe",
  LIKE: "like",
  COMMENT: "comment",
  FOLLOW: "follow",
} as const;

export const YOUTUBE_TRANSCRIPT_CTA_POSITION = {
  EARLY: "early",
  MID: "mid",
  LATE: "late",
} as const;

/** CTA position boundaries as fractions of total duration. */
export const YOUTUBE_TRANSCRIPT_CTA_POSITION_BOUNDARIES = {
  EARLY_END: 0.35,
  LATE_START: 0.8,
} as const;

/** Number of top keywords to return from transcript frequency analysis. */
export const YOUTUBE_TRANSCRIPT_KEYWORD_TOP_N = 30;

/** Characters of intro text inspected for hook classification. */
export const YOUTUBE_TRANSCRIPT_HOOK_INTRO_CHARS = 500;

/** Weight multiplier for title keywords that also appear in the intro zone. */
export const YOUTUBE_TRANSCRIPT_TITLE_INTRO_WEIGHT = 2;

/** Minimum token length for keyword frequency / title alignment. */
export const YOUTUBE_TRANSCRIPT_MIN_KEYWORD_LENGTH = 2;
