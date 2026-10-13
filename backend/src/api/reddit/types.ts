import type { z } from "zod";
import type {
  RedditArchiveKind,
  RedditSearchType,
  RedditUserContent,
} from "./constants";
import type {
  REDDIT_ARCHIVE_REQUEST_SCHEMA,
  REDDIT_FEED_REQUEST_SCHEMA,
  REDDIT_POST_REQUEST_SCHEMA,
  REDDIT_SEARCH_REQUEST_SCHEMA,
  REDDIT_SUBREDDIT_REQUEST_SCHEMA,
  REDDIT_USER_REQUEST_SCHEMA,
  REDDIT_WIKI_REQUEST_SCHEMA,
} from "./schemas";

export type REDDIT_FEED_REQUEST = z.infer<typeof REDDIT_FEED_REQUEST_SCHEMA>;
export type REDDIT_POST_REQUEST = z.infer<typeof REDDIT_POST_REQUEST_SCHEMA>;
export type REDDIT_SUBREDDIT_REQUEST = z.infer<
  typeof REDDIT_SUBREDDIT_REQUEST_SCHEMA
>;
export type REDDIT_USER_REQUEST = z.infer<typeof REDDIT_USER_REQUEST_SCHEMA>;
export type REDDIT_SEARCH_REQUEST = z.infer<
  typeof REDDIT_SEARCH_REQUEST_SCHEMA
>;
export type REDDIT_WIKI_REQUEST = z.infer<typeof REDDIT_WIKI_REQUEST_SCHEMA>;
export type REDDIT_ARCHIVE_REQUEST = z.infer<
  typeof REDDIT_ARCHIVE_REQUEST_SCHEMA
>;

export type REDDIT_MEDIA = {
  type: "image" | "gallery" | "video" | "embed" | "link" | "self";
  /** Best direct URL (image, mp4 fallback, or outbound link). */
  url: string | null;
  thumbnail: string | null;
  /** v.redd.it HLS playlist (has audio) when `type` = video. */
  hlsUrl: string | null;
  durationSec: number | null;
  /** Gallery image URLs in display order. */
  gallery: string[];
};

export type REDDIT_POST = {
  id: string;
  fullname: string;
  url: string;
  title: string;
  text: string | null;
  author: string | null;
  subreddit: string;
  subredditId: string | null;
  createdAt: string | null;
  editedAt: string | null;
  score: number | null;
  upvoteRatio: number | null;
  comments: number | null;
  crossposts: number | null;
  awards: number | null;
  flair: string | null;
  domain: string | null;
  linkUrl: string | null;
  isSelf: boolean;
  isNsfw: boolean;
  isSpoiler: boolean;
  isStickied: boolean;
  isLocked: boolean;
  isOriginalContent: boolean;
  media: REDDIT_MEDIA;
};

export type REDDIT_COMMENT = {
  id: string;
  fullname: string;
  parentId: string | null;
  postId: string | null;
  depth: number;
  author: string | null;
  text: string | null;
  createdAt: string | null;
  editedAt: string | null;
  score: number | null;
  isSubmitter: boolean;
  isStickied: boolean;
  flair: string | null;
  permalink: string | null;
  subreddit: string | null;
};

/** Collapsed replies Reddit did not inline (`kind: more`). */
export type REDDIT_MORE = {
  parentId: string | null;
  count: number;
  ids: string[];
};

export type REDDIT_SUBREDDIT = {
  id: string;
  name: string;
  title: string | null;
  url: string;
  description: string | null;
  sidebar: string | null;
  subscribers: number | null;
  activeUsers: number | null;
  createdAt: string | null;
  isNsfw: boolean;
  type: string | null;
  language: string | null;
  iconUrl: string | null;
  bannerUrl: string | null;
};

export type REDDIT_RULE = {
  name: string;
  description: string | null;
  kind: string | null;
};

export type REDDIT_USER = {
  id: string;
  username: string;
  url: string;
  createdAt: string | null;
  postKarma: number | null;
  commentKarma: number | null;
  totalKarma: number | null;
  iconUrl: string | null;
  description: string | null;
  isVerified: boolean;
  hasPremium: boolean;
  isModerator: boolean;
  isSuspended: boolean;
};

export type REDDIT_PAGE<T> = {
  items: T[];
  after: string | null;
};

export type REDDIT_FEED_RESPONSE = REDDIT_PAGE<REDDIT_POST> & {
  subreddit: string;
  sort: string;
};

export type REDDIT_POST_RESPONSE = {
  post: REDDIT_POST;
  comments: REDDIT_COMMENT[];
  more: REDDIT_MORE[];
};

export type REDDIT_SUBREDDIT_RESPONSE = REDDIT_SUBREDDIT & {
  rules: REDDIT_RULE[];
};

export type REDDIT_USER_ITEM =
  | ({ kind: "post" } & REDDIT_POST)
  | ({ kind: "comment" } & REDDIT_COMMENT);

export type REDDIT_USER_RESPONSE = REDDIT_PAGE<REDDIT_USER_ITEM> & {
  user: REDDIT_USER;
  content: RedditUserContent;
};

export type REDDIT_SEARCH_RESPONSE = {
  type: RedditSearchType;
  query: string;
  items: REDDIT_POST[] | REDDIT_SUBREDDIT[] | REDDIT_USER[];
  after: string | null;
};

export type REDDIT_WIKI_RESPONSE = {
  subreddit: string;
  page: string;
  url: string;
  markdown: string;
  revisionAt: string | null;
  revisionBy: string | null;
};

export type REDDIT_ARCHIVE_RESPONSE = {
  kind: RedditArchiveKind;
  sort: string;
  items: REDDIT_POST[] | REDDIT_COMMENT[];
  /** Pass back as `cursor` for the next page; null when the range is exhausted. */
  next: string | null;
};
