import { z } from "zod";
import {
  TWITTER_DEFAULT_COUNTRY,
  TWITTER_DEFAULT_LIMIT,
  TWITTER_DEFAULT_SEARCH_PAGES,
  TWITTER_MAX_LIMIT,
  TWITTER_MAX_SEARCH_PAGES,
  TWITTER_SEARCH_FILTER,
} from "./constants";
import { ISO_COUNTRY_CODE_SCHEMA } from "../../utils/location-schema";

export const TWITTER_COUNTRY_SCHEMA = ISO_COUNTRY_CODE_SCHEMA.default(
  TWITTER_DEFAULT_COUNTRY,
).describe(
  "Two-letter ISO 3166-1 alpha-2 country code. Routes Evomi proxy and maps trending to a WOEID. Valid codes without a trends WOEID fall back to worldwide. Default US.",
);

export const TWITTER_GEO_REQUEST_SCHEMA = z.object({
  country: TWITTER_COUNTRY_SCHEMA,
});

function twitterLimitSchema(description: string) {
  return z
    .number()
    .int()
    .min(1)
    .max(TWITTER_MAX_LIMIT)
    .default(TWITTER_DEFAULT_LIMIT)
    .describe(
      `${description} (default ${TWITTER_DEFAULT_LIMIT}, max ${TWITTER_MAX_LIMIT})`,
    );
}

export const TWITTER_USER_REQUEST_SCHEMA = TWITTER_GEO_REQUEST_SCHEMA.extend({
  username: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Handle, @handle, or profile URL (x.com/twitter.com)"),
});

export const TWITTER_TWEET_REQUEST_SCHEMA = TWITTER_GEO_REQUEST_SCHEMA.extend({
  tweet: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe("Tweet ID or status URL"),
  includeRelated: z
    .boolean()
    .default(false)
    .describe("If true, also return recent tweets from the same author"),
});

export const TWITTER_TWEETS_REQUEST_SCHEMA = TWITTER_GEO_REQUEST_SCHEMA.extend({
  username: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Handle, @handle, or profile URL"),
  limit: twitterLimitSchema("Maximum tweets to return"),
  cursor: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe("Bottom cursor from a previous /tweets response"),
});

export const TWITTER_SEARCH_REQUEST_SCHEMA = TWITTER_GEO_REQUEST_SCHEMA.extend({
  query: z.string().trim().min(1).max(500).describe("Search keyword or phrase"),
  filter: z
    .enum([TWITTER_SEARCH_FILTER.TWEET, TWITTER_SEARCH_FILTER.USER])
    .default(TWITTER_SEARCH_FILTER.TWEET)
    .describe("tweet (status URLs) or user (profile URLs)"),
  limit: twitterLimitSchema("Maximum hydrated results"),
  pages: z
    .number()
    .int()
    .min(1)
    .max(TWITTER_MAX_SEARCH_PAGES)
    .default(TWITTER_DEFAULT_SEARCH_PAGES)
    .describe(
      `GSearch pages (default ${TWITTER_DEFAULT_SEARCH_PAGES}, max ${TWITTER_MAX_SEARCH_PAGES})`,
    ),
});

export const TWITTER_TRENDING_REQUEST_SCHEMA = TWITTER_GEO_REQUEST_SCHEMA.extend(
  {
    limit: twitterLimitSchema("Maximum trends to return"),
  },
);
