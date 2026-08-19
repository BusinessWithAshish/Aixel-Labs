import type { z } from "zod";
import type { TwitterSearchFilter } from "./constants";
import type {
  TWITTER_SEARCH_REQUEST_SCHEMA,
  TWITTER_TRENDING_REQUEST_SCHEMA,
  TWITTER_TWEETS_REQUEST_SCHEMA,
  TWITTER_TWEET_REQUEST_SCHEMA,
  TWITTER_USER_REQUEST_SCHEMA,
} from "./schemas";

export type TWITTER_USER_REQUEST = z.infer<typeof TWITTER_USER_REQUEST_SCHEMA>;
export type TWITTER_TWEET_REQUEST = z.infer<typeof TWITTER_TWEET_REQUEST_SCHEMA>;
export type TWITTER_TWEETS_REQUEST = z.infer<
  typeof TWITTER_TWEETS_REQUEST_SCHEMA
>;
export type TWITTER_SEARCH_REQUEST = z.infer<
  typeof TWITTER_SEARCH_REQUEST_SCHEMA
>;
export type TWITTER_TRENDING_REQUEST = z.infer<
  typeof TWITTER_TRENDING_REQUEST_SCHEMA
>;

export type TWITTER_USER = {
  id: string;
  screenName: string;
  name: string;
  url: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  followers: number | null;
  following: number | null;
  tweets: number | null;
  mediaTweets: number | null;
  createdAt: string | null;
  isBlueVerified: boolean;
  verifiedType: string | null;
  protected: boolean;
  pinnedTweetIds: string[];
};

export type TWITTER_TWEET_AUTHOR = {
  id: string;
  screenName: string;
  name: string;
  avatarUrl: string | null;
  isBlueVerified: boolean;
};

export type TWITTER_TWEET_METRICS = {
  likes: number | null;
  retweets: number | null;
  replies: number | null;
  quotes: number | null;
  bookmarks: number | null;
  views: number | null;
};

export type TWITTER_TWEET = {
  id: string;
  url: string;
  text: string | null;
  createdAt: string | null;
  lang: string | null;
  conversationId: string | null;
  isQuote: boolean;
  author: TWITTER_TWEET_AUTHOR | null;
  metrics: TWITTER_TWEET_METRICS;
};

export type TWITTER_TWEET_RESPONSE = TWITTER_TWEET & {
  related: TWITTER_TWEET[];
};

export type TWITTER_TWEETS_RESPONSE = {
  user: TWITTER_USER;
  items: TWITTER_TWEET[];
  cursor: string | null;
};

export type TWITTER_TREND = {
  name: string;
  query: string | null;
  url: string | null;
  tweetVolume: number | null;
};

export type TWITTER_TRENDING_RESPONSE = {
  location: { name: string | null; woeid: number };
  asOf: string | null;
  items: TWITTER_TREND[];
};

export type TWITTER_SEARCH_RESPONSE = {
  resultType: TwitterSearchFilter;
  searchQuery: string;
  items: TWITTER_TWEET[] | TWITTER_USER[];
};
