/** Default number of comments returned in one call (one InnerTube page is ~20). */
export const YOUTUBE_COMMENTS_DEFAULT_LIMIT = 20;

/** Hard cap — each page is a `/youtubei/v1/next` call. */
export const YOUTUBE_COMMENTS_MAX_LIMIT = 200;

export const YOUTUBE_COMMENTS_SORT = {
  TOP: "top",
  NEWEST: "newest",
} as const;

/** Watch-next `itemSectionRenderer.sectionIdentifier` for the comments block. */
export const YOUTUBE_COMMENTS_SECTION_ID = "comment-item-section";

/** InnerTube sort-menu titles (WEB client, `hl=en`). */
export const YOUTUBE_COMMENTS_SORT_MENU_TITLE = {
  [YOUTUBE_COMMENTS_SORT.TOP]: "top",
  [YOUTUBE_COMMENTS_SORT.NEWEST]: "newest",
} as const;

export const YOUTUBE_COMMENTS_FIELD_DESCRIPTIONS = {
  VIDEO_ID: "YouTube video ID (e.g. kJQP7kiw5Fk)",
  SORT: 'Comment sort order. "top" is YouTube\'s relevance ranking (default); "newest" is reverse-chronological.',
  LIMIT: `Maximum comments to return (default ${YOUTUBE_COMMENTS_DEFAULT_LIMIT}, max ${YOUTUBE_COMMENTS_MAX_LIMIT}). Each ~20 comments is one InnerTube page.`,
  CONTINUATION:
    "Opaque InnerTube continuation token from a previous response. Pass comments.continuation to page more top-level comments, or a comment's repliesContinuation to fetch that thread's replies. When set, videoId is still required and sort is ignored.",
} as const;

export const YOUTUBE_COMMENTS_ERROR_MESSAGES = {
  NOT_FOUND: "Video not found or unavailable",
  NO_CONTINUATION: "Could not extract comments continuation from the watch page",
} as const;
