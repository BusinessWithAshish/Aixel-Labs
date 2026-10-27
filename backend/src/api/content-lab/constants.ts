export const CONTENT_LAB_API_ROUTES = {
  EXPLORE: "/explore",
  BREAKDOWN: "/breakdown",
  CHECK: "/check",
  CREATOR: "/creator",
} as const;

export const CONTENT_LAB_HANDLER_LABELS = {
  EXPLORE: "content-lab explore",
  BREAKDOWN: "content-lab breakdown",
  CHECK: "content-lab check",
  CREATOR: "content-lab creator",
} as const;

export const CONTENT_LAB_PLATFORMS = ["youtube", "instagram"] as const;
export const CONTENT_LAB_FORMATS = ["video", "short", "reel", "carousel", "post"] as const;

export const CONTENT_LAB_LIMITS = {
  /** Posts returned by explore. */
  defaultPosts: 24,
  maxPosts: 60,
  /** Distinct creators whose baseline (usual views) explore fetches per platform. */
  maxCreatorsPerPlatform: 10,
  /** Recent uploads used for a creator's baseline median. */
  baselineUploads: 30,
  /** Fewer uploads than this and the baseline is not trusted (multiple = null). */
  minBaselineUploads: 5,
  /** Winners a check compares against. */
  checkWinners: 12,
  maxQueryChars: 200,
  maxCheckTextChars: 500,
} as const;

/** A post at or above this multiple of its creator's usual views counts as an outlier. */
export const CONTENT_LAB_OUTLIER_MULTIPLE = 2;

export const CONTENT_LAB_DEFAULT_COUNTRY = "IN";

export const CONTENT_LAB_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  UNSUPPORTED_URL: "Paste a YouTube video/Short or an Instagram post/reel link",
  NOT_FOUND: "That post could not be found or is private",
} as const;

export const CONTENT_LAB_FIELD_DESCRIPTIONS = {
  query: "Topic or niche to search, e.g. 'protein breakfast'",
  platforms: "Platforms to search: youtube, instagram (default both)",
  country: "ISO alpha-2 country for results and proxy routing (default IN)",
  limit: "Maximum posts to return",
  url: "A YouTube video/Short URL or an Instagram post/reel URL",
  text: "Your draft title, hook or caption",
  platform: "Platform the draft is for",
  handle: "Creator handle or profile URL",
} as const;

/** Search results scanned on YouTube to find distinct creators. */
export const CONTENT_LAB_YOUTUBE_SEARCH_RESULTS = 30;
/** Instagram GSearch hits resolved to owners per explore. */
export const CONTENT_LAB_INSTAGRAM_SEARCH_RESOLVE = 24;
/** Instagram posts per page of a creator's grid (the logged-out query's max). */
export const CONTENT_LAB_INSTAGRAM_PAGE_SIZE = 12;
/** YouTube Shorts run up to 3 minutes; anything longer is a long video. */
export const CONTENT_LAB_YOUTUBE_SHORT_MAX_SECONDS = 180;

/** Creators fetched at once (each creator fans out into its own requests). */
export const CONTENT_LAB_CONCURRENCY = {
  youtubeCreators: 4,
  instagramCreators: 5,
} as const;

/**
 * Instagram explore time budgets (ms). One creator's grid takes ~10-25 s (a
 * post query per post, embed pages, the Reels-tab scan), so creators still
 * loading when the budget runs out are dropped instead of stalling the page.
 */
export const CONTENT_LAB_INSTAGRAM_BUDGET_MS = {
  creators: 30_000,
  hits: 10_000,
} as const;

/** YouTube breakdown: comments scanned for rewatch moments, and how many are returned. */
export const CONTENT_LAB_BREAKDOWN_COMMENTS = { scan: 60, top: 5 } as const;

/** Characters of transcript / caption kept as the hook. */
export const CONTENT_LAB_HOOK_MAX_CHARS = 200;

export const CONTENT_LAB_FORMAT_LABELS = {
  video: "Long video",
  short: "Short",
  reel: "Reel",
  carousel: "Carousel",
  post: "Photo post",
} as const;
