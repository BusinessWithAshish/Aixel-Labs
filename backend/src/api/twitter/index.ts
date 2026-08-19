import { type IRouter, Router } from "express";
import { API_ENDPOINTS } from "../../config";
import {
  twitterSearchHandler,
  twitterTrendingHandler,
  twitterTweetHandler,
  twitterTweetsHandler,
  twitterUserHandler,
} from "./handlers";
import { TWITTER_API_ROUTES } from "./constants";

const twitterRoutes: IRouter = Router();

twitterRoutes.post(API_ENDPOINTS.TWITTER.SEARCH.route, twitterSearchHandler);
twitterRoutes.post(API_ENDPOINTS.TWITTER.USER.route, twitterUserHandler);
twitterRoutes.post(API_ENDPOINTS.TWITTER.TWEET.route, twitterTweetHandler);
twitterRoutes.post(API_ENDPOINTS.TWITTER.TWEETS.route, twitterTweetsHandler);
twitterRoutes.post(API_ENDPOINTS.TWITTER.TRENDING.route, twitterTrendingHandler);

export default twitterRoutes;

export { fetchTwitterSearch, fetchTwitterTrending, fetchTwitterTweet, fetchTwitterUser, fetchTwitterUserTweets } from "./client";
export { TwitterApiError } from "./helpers";
export {
  TWITTER_SEARCH_REQUEST_SCHEMA,
  TWITTER_TRENDING_REQUEST_SCHEMA,
  TWITTER_TWEETS_REQUEST_SCHEMA,
  TWITTER_TWEET_REQUEST_SCHEMA,
  TWITTER_USER_REQUEST_SCHEMA,
} from "./schemas";
export { TWITTER_API_ROUTES, TWITTER_SEARCH_FILTER } from "./constants";
export type {
  TWITTER_SEARCH_REQUEST,
  TWITTER_SEARCH_RESPONSE,
  TWITTER_TREND,
  TWITTER_TRENDING_REQUEST,
  TWITTER_TRENDING_RESPONSE,
  TWITTER_TWEET,
  TWITTER_TWEETS_REQUEST,
  TWITTER_TWEETS_RESPONSE,
  TWITTER_TWEET_REQUEST,
  TWITTER_TWEET_RESPONSE,
  TWITTER_USER,
  TWITTER_USER_REQUEST,
} from "./types";
