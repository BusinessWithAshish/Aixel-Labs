import {
  TWITTER_API_TWITTER_ORIGIN,
  TWITTER_DEFAULT_LIMIT,
  TWITTER_DEFAULT_SEARCH_PAGES,
  TWITTER_ERROR_MESSAGES,
  TWITTER_GSEARCH_TWEET_OPERATOR,
  TWITTER_GSEARCH_USER_OPERATOR,
  TWITTER_GRAPHQL_OPERATIONS,
  TWITTER_SEARCH_FILTER,
  TWITTER_SEARCH_HYDRATE_CONCURRENCY,
  TWITTER_SYNDICATION_ORIGIN,
} from "./constants";
import {
  classifyTwitterUrl,
  countryToWoeid,
  extractTimelineTweets,
  mapGraphqlTweet,
  mapGraphqlUser,
  mapSyndicationTweet,
  mapTrendEntries,
  parseTweetId,
  parseTwitterHandle,
  syndicationToken,
} from "./compute";
import { runWithConcurrency } from "../youtube/concurrency";
import {
  TwitterApiError,
  graphqlData,
  shouldPropagateTwitterError,
  twitterGetJson,
  twitterGraphql,
  twitterProxyCountry,
  withTwitterGuest,
  type TwitterGuestContext,
} from "./helpers";
import { fetchGsearch } from "../gsearch";
import type {
  TWITTER_SEARCH_REQUEST,
  TWITTER_SEARCH_RESPONSE,
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

async function graphqlUser(
  ctx: TwitterGuestContext,
  screenName: string,
): Promise<TWITTER_USER> {
  const raw = await twitterGraphql(
    ctx,
    TWITTER_GRAPHQL_OPERATIONS.UserByScreenName,
    { screen_name: screenName, withSafetyModeUserFields: true },
  );
  const user = mapGraphqlUser(graphqlData(raw).user);
  if (!user) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.USER_NOT_FOUND, 404);
  }
  return user;
}

async function graphqlTweet(
  ctx: TwitterGuestContext,
  tweetId: string,
): Promise<TWITTER_TWEET | null> {
  try {
    const raw = await twitterGraphql(
      ctx,
      TWITTER_GRAPHQL_OPERATIONS.TweetResultByRestId,
      {
        tweetId,
        includePromotedContent: false,
        withCommunity: false,
        withVoice: false,
      },
    );
    return mapGraphqlTweet(graphqlData(raw).tweetResult);
  } catch (err) {
    if (shouldPropagateTwitterError(err)) throw err;
    return null;
  }
}

async function syndicationTweet(
  ctx: TwitterGuestContext,
  tweetId: string,
): Promise<TWITTER_TWEET | null> {
  const token = syndicationToken(tweetId);
  const url = `${TWITTER_SYNDICATION_ORIGIN}/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en&token=${encodeURIComponent(token)}`;
  try {
    const raw = await twitterGetJson(ctx, url);
    return mapSyndicationTweet(raw);
  } catch (err) {
    if (shouldPropagateTwitterError(err)) throw err;
    return null;
  }
}

async function resolveTweet(
  ctx: TwitterGuestContext,
  tweetId: string,
): Promise<TWITTER_TWEET> {
  const tweet = (await graphqlTweet(ctx, tweetId)) ?? (await syndicationTweet(ctx, tweetId));
  if (!tweet) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.TWEET_NOT_FOUND, 404);
  }
  return tweet;
}

export async function fetchTwitterUser(
  input: TWITTER_USER_REQUEST,
): Promise<TWITTER_USER> {
  const username = parseTwitterHandle(input.username);
  if (!username) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.USER_NOT_FOUND, 400);
  }
  return withTwitterGuest(input.country, (ctx) => graphqlUser(ctx, username));
}

export async function fetchTwitterTweet(
  input: TWITTER_TWEET_REQUEST,
): Promise<TWITTER_TWEET_RESPONSE> {
  const tweetId = parseTweetId(input.tweet);
  if (!tweetId) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.TWEET_NOT_FOUND, 400);
  }
  return withTwitterGuest(input.country, async (ctx) => {
    const tweet = await resolveTweet(ctx, tweetId);
    if (!input.includeRelated || !tweet.author?.id) {
      return { ...tweet, related: [] };
    }
    const timeline = await twitterGraphql(
      ctx,
      TWITTER_GRAPHQL_OPERATIONS.UserTweets,
      {
        userId: tweet.author.id,
        count: 12,
        includePromotedContent: false,
        withQuickPromoteEligibilityTweetFields: false,
        withVoice: false,
        withV2Timeline: true,
      },
    );
    const related = extractTimelineTweets(graphqlData(timeline))
      .items.filter((item) => item.id !== tweet.id)
      .slice(0, 8);
    return { ...tweet, related };
  });
}

export async function fetchTwitterUserTweets(
  input: TWITTER_TWEETS_REQUEST,
): Promise<TWITTER_TWEETS_RESPONSE> {
  const username = parseTwitterHandle(input.username);
  if (!username) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.USER_NOT_FOUND, 400);
  }
  const limit = input.limit ?? TWITTER_DEFAULT_LIMIT;
  return withTwitterGuest(input.country, async (ctx) => {
    const user = await graphqlUser(ctx, username);
    const variables: Record<string, unknown> = {
      userId: user.id,
      count: limit,
      includePromotedContent: false,
      withQuickPromoteEligibilityTweetFields: false,
      withVoice: false,
      withV2Timeline: true,
    };
    if (input.cursor) variables.cursor = input.cursor;
    const raw = await twitterGraphql(
      ctx,
      TWITTER_GRAPHQL_OPERATIONS.UserTweets,
      variables,
    );
    const { items, cursor } = extractTimelineTweets(graphqlData(raw));
    return { user, items: items.slice(0, limit), cursor };
  });
}

export async function fetchTwitterTrending(
  input: TWITTER_TRENDING_REQUEST,
): Promise<TWITTER_TRENDING_RESPONSE> {
  const woeid = countryToWoeid(input.country);
  const limit = input.limit ?? TWITTER_DEFAULT_LIMIT;
  return withTwitterGuest(input.country, async (ctx) => {
    const raw = await twitterGetJson(
      ctx,
      `${TWITTER_API_TWITTER_ORIGIN}/1.1/trends/place.json?id=${woeid}`,
    );
    const mapped = mapTrendEntries(raw);
    return { ...mapped, items: mapped.items.slice(0, limit) };
  });
}

export async function fetchTwitterSearch(
  input: TWITTER_SEARCH_REQUEST,
): Promise<TWITTER_SEARCH_RESPONSE> {
  const query = input.query.trim();
  const filter = input.filter ?? TWITTER_SEARCH_FILTER.TWEET;
  const limit = input.limit ?? TWITTER_DEFAULT_LIMIT;
  const pages = input.pages ?? TWITTER_DEFAULT_SEARCH_PAGES;
  const proxyCountry = twitterProxyCountry(input.country);
  const searchQuery =
    filter === TWITTER_SEARCH_FILTER.USER
      ? `${TWITTER_GSEARCH_USER_OPERATOR} ${query}`
      : `${TWITTER_GSEARCH_TWEET_OPERATOR} ${query}`;

  const { results } = await fetchGsearch({
    searchQuery,
    pages,
    country: proxyCountry,
  });

  const classified = results.flatMap((row) => {
    const url = row.url ?? row.id;
    if (!url) return [];
    return [classifyTwitterUrl(url)];
  });

  if (filter === TWITTER_SEARCH_FILTER.USER) {
    const handles: string[] = [];
    const seen = new Set<string>();
    for (const hit of classified) {
      const handle = hit.handle;
      if (!handle) continue;
      const key = handle.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      handles.push(handle);
      if (handles.length >= limit) break;
    }
    if (handles.length === 0) {
      throw new TwitterApiError(TWITTER_ERROR_MESSAGES.SEARCH_EMPTY, 404);
    }
    return withTwitterGuest(proxyCountry, async (ctx) => {
      const mapped = await runWithConcurrency(
        handles,
        TWITTER_SEARCH_HYDRATE_CONCURRENCY,
        async (handle) => {
          try {
            return await graphqlUser(ctx, handle);
          } catch (err) {
            if (shouldPropagateTwitterError(err)) throw err;
            return null;
          }
        },
      );
      const items = mapped.filter((u): u is TWITTER_USER => u !== null);
      if (items.length === 0) {
        throw new TwitterApiError(TWITTER_ERROR_MESSAGES.SEARCH_EMPTY, 404);
      }
      return { resultType: filter, searchQuery: query, items };
    });
  }

  const tweetIds: string[] = [];
  const seen = new Set<string>();
  for (const hit of classified) {
    if (!hit.tweetId || seen.has(hit.tweetId)) continue;
    seen.add(hit.tweetId);
    tweetIds.push(hit.tweetId);
    if (tweetIds.length >= limit) break;
  }
  if (tweetIds.length === 0) {
    throw new TwitterApiError(TWITTER_ERROR_MESSAGES.SEARCH_EMPTY, 404);
  }
  return withTwitterGuest(proxyCountry, async (ctx) => {
    const mapped = await runWithConcurrency(
      tweetIds,
      TWITTER_SEARCH_HYDRATE_CONCURRENCY,
      async (id) => {
        try {
          return await resolveTweet(ctx, id);
        } catch (err) {
          if (shouldPropagateTwitterError(err)) throw err;
          return null;
        }
      },
    );
    const items = mapped.filter((t): t is TWITTER_TWEET => t !== null);
    if (items.length === 0) {
      throw new TwitterApiError(TWITTER_ERROR_MESSAGES.SEARCH_EMPTY, 404);
    }
    return { resultType: filter, searchQuery: query, items };
  });
}
