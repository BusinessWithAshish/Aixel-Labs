import { TWITTER_HANDLER_LABELS } from "./constants";
import { createTwitterHandler } from "./create-handler";
import {
  fetchTwitterSearch,
  fetchTwitterTrending,
  fetchTwitterTweet,
  fetchTwitterUser,
  fetchTwitterUserTweets,
} from "./client";
import { mapTwitterError } from "./helpers";
import {
  TWITTER_SEARCH_REQUEST_SCHEMA,
  TWITTER_TRENDING_REQUEST_SCHEMA,
  TWITTER_TWEETS_REQUEST_SCHEMA,
  TWITTER_TWEET_REQUEST_SCHEMA,
  TWITTER_USER_REQUEST_SCHEMA,
} from "./schemas";

export const twitterUserHandler = createTwitterHandler({
  label: TWITTER_HANDLER_LABELS.USER,
  schema: TWITTER_USER_REQUEST_SCHEMA,
  fetch: fetchTwitterUser,
  mapError: mapTwitterError,
});

export const twitterTweetHandler = createTwitterHandler({
  label: TWITTER_HANDLER_LABELS.TWEET,
  schema: TWITTER_TWEET_REQUEST_SCHEMA,
  fetch: fetchTwitterTweet,
  mapError: mapTwitterError,
});

export const twitterTweetsHandler = createTwitterHandler({
  label: TWITTER_HANDLER_LABELS.TWEETS,
  schema: TWITTER_TWEETS_REQUEST_SCHEMA,
  fetch: fetchTwitterUserTweets,
  mapError: mapTwitterError,
});

export const twitterSearchHandler = createTwitterHandler({
  label: TWITTER_HANDLER_LABELS.SEARCH,
  schema: TWITTER_SEARCH_REQUEST_SCHEMA,
  fetch: fetchTwitterSearch,
  mapError: mapTwitterError,
});

export const twitterTrendingHandler = createTwitterHandler({
  label: TWITTER_HANDLER_LABELS.TRENDING,
  schema: TWITTER_TRENDING_REQUEST_SCHEMA,
  fetch: fetchTwitterTrending,
  mapError: mapTwitterError,
});
