import { REDDIT_HANDLER_LABELS } from "./constants";
import { fetchRedditArchive } from "./archive";
import { createRedditHandler } from "./create-handler";
import {
  fetchRedditFeed,
  fetchRedditPost,
  fetchRedditSearch,
  fetchRedditSubreddit,
  fetchRedditUser,
  fetchRedditWiki,
} from "./client";
import { mapRedditError } from "./helpers";
import {
  REDDIT_ARCHIVE_REQUEST_SCHEMA,
  REDDIT_FEED_REQUEST_SCHEMA,
  REDDIT_POST_REQUEST_SCHEMA,
  REDDIT_SEARCH_REQUEST_SCHEMA,
  REDDIT_SUBREDDIT_REQUEST_SCHEMA,
  REDDIT_USER_REQUEST_SCHEMA,
  REDDIT_WIKI_REQUEST_SCHEMA,
} from "./schemas";

export const redditFeedHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.FEED,
  schema: REDDIT_FEED_REQUEST_SCHEMA,
  fetch: fetchRedditFeed,
  mapError: mapRedditError,
});

export const redditPostHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.POST,
  schema: REDDIT_POST_REQUEST_SCHEMA,
  fetch: fetchRedditPost,
  mapError: mapRedditError,
});

export const redditSubredditHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.SUBREDDIT,
  schema: REDDIT_SUBREDDIT_REQUEST_SCHEMA,
  fetch: fetchRedditSubreddit,
  mapError: mapRedditError,
});

export const redditUserHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.USER,
  schema: REDDIT_USER_REQUEST_SCHEMA,
  fetch: fetchRedditUser,
  mapError: mapRedditError,
});

export const redditSearchHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.SEARCH,
  schema: REDDIT_SEARCH_REQUEST_SCHEMA,
  fetch: fetchRedditSearch,
  mapError: mapRedditError,
});

export const redditWikiHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.WIKI,
  schema: REDDIT_WIKI_REQUEST_SCHEMA,
  fetch: fetchRedditWiki,
  mapError: mapRedditError,
});

export const redditArchiveHandler = createRedditHandler({
  label: REDDIT_HANDLER_LABELS.ARCHIVE,
  schema: REDDIT_ARCHIVE_REQUEST_SCHEMA,
  fetch: fetchRedditArchive,
  mapError: mapRedditError,
});
