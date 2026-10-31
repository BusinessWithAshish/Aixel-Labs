export const CONTENT_LAB_API_ROUTES = {
  EXPLORE: "/explore",
  BREAKDOWN: "/breakdown",
  CHECK: "/check",
  CREATOR: "/creator",
  SUGGEST: "/suggest",
  KEYWORD: "/keyword",
} as const;

export const CONTENT_LAB_HANDLER_LABELS = {
  EXPLORE: "content-lab explore",
  BREAKDOWN: "content-lab breakdown",
  CHECK: "content-lab check",
  CREATOR: "content-lab creator",
  SUGGEST: "content-lab suggest",
  KEYWORD: "content-lab keyword",
} as const;

export const CONTENT_LAB_PLATFORMS = ["youtube", "instagram"] as const;
export const CONTENT_LAB_FORMATS = ["video", "short", "reel", "carousel", "post"] as const;

export const CONTENT_LAB_LIMITS = {
  /** Posts returned by explore. */
  defaultPosts: 24,
  maxPosts: 60,
  /** New creators (not cached) whose baseline explore fetches per platform per page. */
  maxCreatorsPerPlatform: 12,
  /** Instagram owners are cheap (three ~0.5 s queries) and most hits come from a new one, so more per page. */
  maxInstagramCreatorsPerPage: 24,
  /** Recent uploads used for a creator's baseline median. */
  baselineUploads: 30,
  /** Fewer uploads than this and the baseline is not trusted (multiple = null). */
  minBaselineUploads: 5,
  /** Winners a check compares against. */
  checkWinners: 12,
  maxQueryChars: 200,
  maxCheckTextChars: 500,
  maxCursorChars: 12_000,
  maxSuggestQueryChars: 100,
} as const;

/** A post at or above this multiple of its creator's usual views counts as an outlier. */
export const CONTENT_LAB_OUTLIER_MULTIPLE = 2;

/**
 * Explore ranking (`compute/rank.ts`). Score = weights · (beat-the-usual,
 * volume, recency), each 0-1 on a log / decay scale. Posts under the floor
 * rank after every post that clears it.
 */
export const CONTENT_LAB_RANK = {
  weights: { multiple: 0.4, volume: 0.35, recency: 0.25 },
  /** Views (plays) that score 0 and 1 on the volume scale (log10 in between). */
  volumeRange: [1_000, 10_000_000],
  /** Multiples that score 0 and 1 (log2 in between); no baseline counts as 1x. */
  multipleRange: [0.5, 32],
  /** Recency halves every this many days; undated posts score as this old. */
  recencyHalfLifeDays: 60,
  undatedAgeDays: 180,
  /** Below this many views (Reels plays) a post sinks to the end. */
  minViews: 5_000,
  /** Photo posts and carousels: below this many likes they sink to the end. */
  minLikes: 100,
  /** Photo posts hide views; likes × this stands in for views on the volume scale. */
  likesToViews: 25,
  /**
   * With both platforms asked for, each keeps at least this share of a page
   * when it has the posts: half each, so YouTube's bigger numbers can't
   * crowd Instagram down to a few cards.
   */
  minPlatformShare: 0.5,
  /**
   * Instagram explore shows a post only when it clears the floor and either
   * beat its creator's usual (`keepMinMultiple`) or is big on its own
   * (`viralVolume` views; likes × `likesToViews` for photo posts).
   */
  keepMinMultiple: 1,
  viralVolume: 100_000,
} as const;

/** Explore leaves out posts older than this ("2 years ago" and older): it shows what works now. */
export const CONTENT_LAB_MAX_AGE_DAYS = 400;

/** Creator-expansion: on-topic winners added from a creator's own recent uploads, at most this many per creator. */
export const CONTENT_LAB_EXPANSION_PER_CREATOR = 3;

/** Seen post ids a cursor carries (oldest dropped first). */
export const CONTENT_LAB_CURSOR_MAX_SEEN = 400;

/**
 * Posts read but not returned (cut by the page, or their creator was late)
 * carry over in the cursor and come first on the next page. Each carries at
 * most `maxCarries` times; a platform holds at most `youtube` / `instagram`
 * of them, and with a page's worth waiting it reads no new search that page.
 * A failed search batch is retried on the next page, `maxBatchFailures` times
 * in a row at most.
 */
export const CONTENT_LAB_CARRY = {
  maxCarries: 3,
  youtube: 48,
  instagram: 72,
  titleChars: 100,
  maxBatchFailures: 3,
} as const;

/** In-memory caches: a creator's recent uploads / grid, suggest answers. */
export const CONTENT_LAB_CACHE = {
  creatorTtlMs: 20 * 60_000,
  creatorMaxEntries: 500,
  suggestTtlMs: 10 * 60_000,
  suggestMaxEntries: 1_000,
  /** Google Trends interest moves weekly; an hour keeps repeat searches free. */
  trendTtlMs: 60 * 60_000,
  trendMaxEntries: 500,
} as const;

/** Creators the suggest route returns. */
export const CONTENT_LAB_SUGGEST_LIMIT = 8;

export const CONTENT_LAB_DEFAULT_COUNTRY = "IN";

export const CONTENT_LAB_ERROR_MESSAGES = {
  INVALID_PARAMS: "Invalid request parameters",
  UNSUPPORTED_URL: "Paste a YouTube video/Short or an Instagram post/reel link",
  NOT_FOUND: "That post could not be found or is private",
  INSTAGRAM_SLOW: "Instagram is slow right now. Scroll for more and it will catch up.",
  YOUTUBE_SEARCH_FAILED: "YouTube search didn't answer this time. Scroll for more to try again.",
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
  cursor: "nextCursor from the previous explore page; omit for the first page",
  suggestQuery: "What the user has typed so far: a name or part of a handle",
  keywordQuery: "Topic to score, e.g. 'protein breakfast'",
  keywordTrend:
    "Also read 12 months of YouTube search interest (Google Trends, ~2 s); false returns only what people search (~0.3 s)",
  keywordPlatforms: "Platforms to score the topic on: youtube, instagram (default both)",
} as const;

/**
 * Keyword score (`keyword.ts`): 0-100 from how many searches YouTube
 * completes it to (`demandSearches` or more = full marks), how busy it is
 * now against its busiest week of the year (last `recentWeeks`), and its
 * momentum (last `recentWeeks` against the `previousWeeks` before; within
 * ±`steadyPercent` is steady, ±`momentumRange` % scores 0 / 1).
 */
export const CONTENT_LAB_KEYWORD = {
  weights: { demand: 0.4, now: 0.35, momentum: 0.25 },
  /** No trend data: the score is demand alone, capped here. */
  demandOnlyMax: 70,
  demandSearches: 10,
  recentWeeks: 4,
  previousWeeks: 8,
  steadyPercent: 15,
  momentumRange: 50,
  /** Fewer weeks with any searches than this: too few searches to chart. */
  minWeeks: 8,
  rising: 5,
  trendTimeoutMs: 6_000,
  labels: { strong: 65, okay: 40 },
  /**
   * Instagram (guest hashtag search, ~0.5 s): `depth` from the posts on the
   * topic's own hashtag (or the biggest one starting with it) on a log scale,
   * `minPosts` = 0 and `maxPosts` = full marks; `breadth` from how many
   * related hashtags have `busyPosts` or more (`busyTags` = full marks).
   */
  instagram: {
    weights: { depth: 0.8, breadth: 0.2 },
    minPosts: 100,
    maxPosts: 10_000_000,
    busyPosts: 1_000,
    busyTags: 10,
    hashtags: 8,
  },
} as const;

/**
 * YouTube search streams explore merges, in order (`YOUTUBE_SEARCH_SORT_SP`
 * keys): most-viewed uploads of this month, of this year, then relevance.
 * Each pages on with its own continuation token.
 */
export const CONTENT_LAB_YOUTUBE_STREAMS = ["POPULAR_THIS_MONTH", "POPULAR_THIS_YEAR", "RELEVANCE"] as const;

/**
 * Instagram GSearch searches explore runs, in order; each page takes the next
 * `perPage` of them. `{q}` is the topic, `{tag}` a related hashtag from
 * Instagram's tag search (biggest first). Reels first (page 1 is all reels,
 * the most-viral search among them): they carry play counts. Photo posts last.
 */
export const CONTENT_LAB_INSTAGRAM_SEARCHES = {
  first: [
    { kind: "reel", text: "{q}", time: "month" },
    { kind: "reel", text: "{q}", time: "year" },
    { kind: "reel", text: "{q} viral", time: "year" },
  ],
  perTag: { kind: "reel", text: "{tag}", time: "year" },
  last: [
    { kind: "post", text: "{q}", time: "year" },
    { kind: "post", text: "{q}", time: undefined },
  ],
  /** Related hashtags turned into searches. */
  tags: 3,
  perPage: 2,
} as const;

/** Instagram search hits looked up per explore page (interleaved across the page's searches). */
export const CONTENT_LAB_INSTAGRAM_HITS_PER_PAGE = 36;
/** Tries at a reel's embed page view count in explore (the page 500s about one fetch in four). */
export const CONTENT_LAB_INSTAGRAM_EMBED_TRIES = 2;
/** Instagram posts per page of a creator's grid (the logged-out query's max). */
export const CONTENT_LAB_INSTAGRAM_PAGE_SIZE = 12;
/** Instagram photo posts whose likes are loaded for a photo baseline (one post query each). */
export const CONTENT_LAB_INSTAGRAM_PHOTO_BASELINE_POSTS = 8;
/** YouTube Shorts run up to 3 minutes; anything longer is a long video. */
export const CONTENT_LAB_YOUTUBE_SHORT_MAX_SECONDS = 180;

/** Creators fetched at once (each creator fans out into its own requests). */
export const CONTENT_LAB_CONCURRENCY = {
  youtubeCreators: 8,
  instagramCreators: 8,
  /** Post queries at once (direct GraphQL, ~0.4 s each). */
  instagramHits: 10,
} as const;

/**
 * Explore time budgets (ms). Creators still loading when a budget runs out
 * are dropped (with their posts) instead of stalling the page; `youtubeWatch`
 * bounds the likes / comments / exact-date lookups for the posts returned.
 * Instagram's GSearch calls go through the proxy and swing from 4 s to 16 s
 * under load, so they get their own cap: once the first returns, the others
 * have `instagramSearchStraggler` more (at most `instagramSearch` in all);
 * the lookups after them get `instagram`, and post lookups stop
 * `instagramOwnerLead` early so the owners they started can finish.
 */
export const CONTENT_LAB_BUDGET_MS = {
  instagramSearch: 12_000,
  instagramSearchStraggler: 4_000,
  instagram: 12_000,
  instagramOwnerLead: 4_000,
  youtubeCreators: 15_000,
  youtubeWatch: 5_000,
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
