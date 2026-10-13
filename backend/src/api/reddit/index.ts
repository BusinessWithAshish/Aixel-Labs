import { type IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import {
  redditArchiveHandler,
  redditFeedHandler,
  redditPostHandler,
  redditSearchHandler,
  redditSubredditHandler,
  redditUserHandler,
  redditWikiHandler,
} from "./handlers";

const redditRoutes: IRouter = Router();

redditRoutes.post(API_ENDPOINTS.REDDIT.FEED.route, redditFeedHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.POST.route, redditPostHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.SUBREDDIT.route, redditSubredditHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.USER.route, redditUserHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.SEARCH.route, redditSearchHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.WIKI.route, redditWikiHandler);
redditRoutes.post(API_ENDPOINTS.REDDIT.ARCHIVE.route, redditArchiveHandler);

export default redditRoutes;

export { fetchRedditArchive } from "./archive";
export {
  fetchRedditFeed,
  fetchRedditPost,
  fetchRedditSearch,
  fetchRedditSubreddit,
  fetchRedditUser,
  fetchRedditWiki,
} from "./client";
export { RedditApiError } from "./helpers";
export {
  REDDIT_ARCHIVE_REQUEST_SCHEMA,
  REDDIT_FEED_REQUEST_SCHEMA,
  REDDIT_POST_REQUEST_SCHEMA,
  REDDIT_SEARCH_REQUEST_SCHEMA,
  REDDIT_SUBREDDIT_REQUEST_SCHEMA,
  REDDIT_USER_REQUEST_SCHEMA,
  REDDIT_WIKI_REQUEST_SCHEMA,
} from "./schemas";
export {
  REDDIT_API_ROUTES,
  REDDIT_ARCHIVE_KIND,
  REDDIT_COMMENT_SORT,
  REDDIT_FEED_SORT,
  REDDIT_SEARCH_TYPE,
  REDDIT_TIME_FILTER,
  REDDIT_USER_CONTENT,
} from "./constants";
export type {
  REDDIT_ARCHIVE_REQUEST,
  REDDIT_ARCHIVE_RESPONSE,
  REDDIT_COMMENT,
  REDDIT_FEED_REQUEST,
  REDDIT_FEED_RESPONSE,
  REDDIT_MEDIA,
  REDDIT_POST,
  REDDIT_POST_REQUEST,
  REDDIT_POST_RESPONSE,
  REDDIT_SEARCH_REQUEST,
  REDDIT_SEARCH_RESPONSE,
  REDDIT_SUBREDDIT,
  REDDIT_SUBREDDIT_REQUEST,
  REDDIT_SUBREDDIT_RESPONSE,
  REDDIT_USER,
  REDDIT_USER_REQUEST,
  REDDIT_USER_RESPONSE,
  REDDIT_WIKI_REQUEST,
  REDDIT_WIKI_RESPONSE,
} from "./types";
