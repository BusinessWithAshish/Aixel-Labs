import { z } from "zod";
import {
  REDDIT_ARCHIVE_KIND,
  REDDIT_ARCHIVE_MAX_LIMIT,
  REDDIT_ARCHIVE_SORT,
  REDDIT_COMMENT_SORT,
  REDDIT_DEFAULT_COMMENT_DEPTH,
  REDDIT_DEFAULT_COMMENT_LIMIT,
  REDDIT_DEFAULT_COUNTRY,
  REDDIT_DEFAULT_LIMIT,
  REDDIT_FEED_SORT,
  REDDIT_MAX_COMMENT_DEPTH,
  REDDIT_MAX_COMMENT_LIMIT,
  REDDIT_MAX_LIMIT,
  REDDIT_SEARCH_SORT,
  REDDIT_SEARCH_TYPE,
  REDDIT_TIME_FILTER,
  REDDIT_USER_CONTENT,
  REDDIT_USER_SORT,
} from "./constants";
import { ISO_COUNTRY_CODE_SCHEMA } from "../../utils/location-schema";

export const REDDIT_COUNTRY_SCHEMA = ISO_COUNTRY_CODE_SCHEMA.default(
  REDDIT_DEFAULT_COUNTRY,
).describe(
  "Two-letter ISO 3166-1 alpha-2 country code for Evomi proxy routing. Default US.",
);

export const REDDIT_GEO_REQUEST_SCHEMA = z.object({
  country: REDDIT_COUNTRY_SCHEMA,
});

function redditLimitSchema(description: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(REDDIT_MAX_LIMIT)
    .default(REDDIT_DEFAULT_LIMIT)
    .describe(
      `${description} (default ${REDDIT_DEFAULT_LIMIT}, max ${REDDIT_MAX_LIMIT})`,
    );
}

const REDDIT_AFTER_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .optional()
  .describe("Pagination cursor — the previous response's data.after");

const REDDIT_TIME_SCHEMA = z
  .enum(Object.values(REDDIT_TIME_FILTER) as [string, ...string[]])
  .default(REDDIT_TIME_FILTER.DAY)
  .describe("Time window for top/controversial sorts: hour|day|week|month|year|all");

const REDDIT_SUBREDDIT_FIELD = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("Subreddit name, r/name, or subreddit URL");

export const REDDIT_FEED_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  subreddit: REDDIT_SUBREDDIT_FIELD.default("popular").describe(
    "Subreddit name, r/name, or URL. `popular` / `all` are the sitewide feeds. Default popular.",
  ),
  sort: z
    .enum(Object.values(REDDIT_FEED_SORT) as [string, ...string[]])
    .default(REDDIT_FEED_SORT.HOT)
    .describe("hot|new|top|rising|controversial"),
  time: REDDIT_TIME_SCHEMA,
  limit: redditLimitSchema("Maximum posts to return"),
  after: REDDIT_AFTER_SCHEMA,
});

export const REDDIT_POST_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  post: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Post ID (abc123 / t3_abc123), post URL, or redd.it short link"),
  commentSort: z
    .enum(Object.values(REDDIT_COMMENT_SORT) as [string, ...string[]])
    .default(REDDIT_COMMENT_SORT.CONFIDENCE)
    .describe("confidence (best)|top|new|controversial|old|qa"),
  commentLimit: z
    .number()
    .int()
    .min(0)
    .max(REDDIT_MAX_COMMENT_LIMIT)
    .default(REDDIT_DEFAULT_COMMENT_LIMIT)
    .describe(
      `Max comments to load (default ${REDDIT_DEFAULT_COMMENT_LIMIT}, max ${REDDIT_MAX_COMMENT_LIMIT}). 0 returns the post only.`,
    ),
  depth: z
    .number()
    .int()
    .min(1)
    .max(REDDIT_MAX_COMMENT_DEPTH)
    .default(REDDIT_DEFAULT_COMMENT_DEPTH)
    .describe(
      `Max reply depth (default ${REDDIT_DEFAULT_COMMENT_DEPTH}, max ${REDDIT_MAX_COMMENT_DEPTH})`,
    ),
});

export const REDDIT_SUBREDDIT_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  subreddit: REDDIT_SUBREDDIT_FIELD,
  includeRules: z
    .boolean()
    .default(true)
    .describe("Also return the subreddit's posting rules"),
});

export const REDDIT_USER_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  username: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Username, u/name, or profile URL"),
  content: z
    .enum(Object.values(REDDIT_USER_CONTENT) as [string, ...string[]])
    .default(REDDIT_USER_CONTENT.OVERVIEW)
    .describe("overview (posts + comments)|submitted (posts)|comments"),
  sort: z
    .enum(Object.values(REDDIT_USER_SORT) as [string, ...string[]])
    .default(REDDIT_USER_SORT.NEW)
    .describe("new|hot|top|controversial"),
  time: REDDIT_TIME_SCHEMA,
  limit: redditLimitSchema("Maximum items to return"),
  after: REDDIT_AFTER_SCHEMA,
});

export const REDDIT_SEARCH_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  query: z.string().trim().min(1).max(512).describe("Search keyword or phrase"),
  type: z
    .enum(Object.values(REDDIT_SEARCH_TYPE) as [string, ...string[]])
    .default(REDDIT_SEARCH_TYPE.POST)
    .describe("post|subreddit|user"),
  subreddit: REDDIT_SUBREDDIT_FIELD.optional().describe(
    "Restrict post search to one subreddit (type=post only)",
  ),
  sort: z
    .enum(Object.values(REDDIT_SEARCH_SORT) as [string, ...string[]])
    .default(REDDIT_SEARCH_SORT.RELEVANCE)
    .describe("relevance|hot|top|new|comments (type=post only)"),
  time: REDDIT_TIME_SCHEMA.default(REDDIT_TIME_FILTER.ALL),
  includeNsfw: z
    .boolean()
    .default(false)
    .describe("Include over-18 results"),
  limit: redditLimitSchema("Maximum results to return"),
  after: REDDIT_AFTER_SCHEMA,
});

export const REDDIT_WIKI_REQUEST_SCHEMA = REDDIT_GEO_REQUEST_SCHEMA.extend({
  subreddit: REDDIT_SUBREDDIT_FIELD,
  page: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .default("index")
    .describe("Wiki page path, e.g. index or faq/rules. Default index."),
});

const REDDIT_ARCHIVE_DATE_SCHEMA = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .optional();

export const REDDIT_ARCHIVE_REQUEST_SCHEMA = z.object({
  kind: z
    .enum(Object.values(REDDIT_ARCHIVE_KIND) as [string, ...string[]])
    .default(REDDIT_ARCHIVE_KIND.POST)
    .describe("post|comment"),
  subreddit: REDDIT_SUBREDDIT_FIELD.optional(),
  author: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Username, u/name, or profile URL"),
  post: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("kind=comment only: all comments under this post (ID or URL)"),
  query: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .optional()
    .describe(
      'Keywords (title + text for posts, body for comments). Words are ANDed; "quoted phrase", OR, -exclude. Needs subreddit or author (or post).',
    ),
  after: REDDIT_ARCHIVE_DATE_SCHEMA.describe(
    "Only items created after this: ISO date/datetime, epoch seconds, or relative (7d, 3m, 1year)",
  ),
  before: REDDIT_ARCHIVE_DATE_SCHEMA.describe(
    "Only items created before this (same formats as after)",
  ),
  sort: z
    .enum(Object.values(REDDIT_ARCHIVE_SORT) as [string, ...string[]])
    .default(REDDIT_ARCHIVE_SORT.DESC)
    .describe("By creation time: desc (newest first) | asc"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(REDDIT_ARCHIVE_MAX_LIMIT)
    .default(REDDIT_DEFAULT_LIMIT)
    .describe(
      `Maximum items to return (default ${REDDIT_DEFAULT_LIMIT}, max ${REDDIT_ARCHIVE_MAX_LIMIT})`,
    ),
  cursor: z
    .string()
    .trim()
    .regex(/^\d{1,13}$/)
    .optional()
    .describe("Pagination cursor — the previous response's data.next"),
});
