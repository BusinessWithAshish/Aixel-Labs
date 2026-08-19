import {
  TWITTER_ORIGIN,
  TWITTER_RESERVED_HANDLES,
  TWITTER_WOEID_BY_COUNTRY,
  TWITTER_WOEID_WORLDWIDE,
} from "./constants";
import type {
  TWITTER_TWEET,
  TWITTER_TWEET_AUTHOR,
  TWITTER_TWEET_METRICS,
  TWITTER_TREND,
  TWITTER_USER,
} from "./types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(value: unknown): boolean {
  return value === true;
}

export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(
    /(?:twitter\.com|x\.com)\/(?:i\/web\/status|i\/status|[^/]+\/status)\/(\d+)/i,
  );
  if (fromUrl?.[1]) return fromUrl[1];
  if (/^\d{1,20}$/.test(trimmed)) return trimmed;
  return null;
}

export function parseTwitterHandle(input: string): string | null {
  const trimmed = input.trim();
  try {
    const withProto = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(withProto);
    if (/twitter\.com|x\.com/i.test(u.hostname)) {
      const seg = u.pathname.split("/").filter(Boolean)[0];
      if (seg && !TWITTER_RESERVED_HANDLES.has(seg.toLowerCase())) {
        return seg.replace(/^@/, "");
      }
      return null;
    }
  } catch {
    /* not a URL */
  }
  const m = trimmed.match(/^@?([A-Za-z0-9_]{1,15})$/);
  const handle = m?.[1];
  if (!handle || TWITTER_RESERVED_HANDLES.has(handle.toLowerCase())) return null;
  return handle;
}

export function classifyTwitterUrl(raw: string): {
  kind: "tweet" | "user" | "other";
  tweetId: string | null;
  handle: string | null;
  url: string;
} {
  const tweetId = parseTweetId(raw);
  if (tweetId) {
    return { kind: "tweet", tweetId, handle: parseTwitterHandle(raw), url: raw };
  }
  const handle = parseTwitterHandle(raw);
  if (handle) return { kind: "user", tweetId: null, handle, url: raw };
  return { kind: "other", tweetId: null, handle: null, url: raw };
}

export function countryToWoeid(country: string): number {
  return TWITTER_WOEID_BY_COUNTRY[country.toUpperCase()] ?? TWITTER_WOEID_WORLDWIDE;
}

/** Embed-widget token used by `cdn.syndication.twimg.com/tweet-result`. */
export function syndicationToken(tweetId: string): string {
  // Must match X's own widget JS (`Number(id)`, not BigInt). Snowflakes above
  // 2^53 round, but the formula divides by 1e15 first so the token still
  // agrees with the CDN.
  return ((Number(tweetId) / 1e15) * Math.PI)
    .toString(36)
    .replace(/0+|\./g, "");
}

function tweetUrl(screenName: string | null, id: string): string {
  const handle = screenName || "i";
  return `${TWITTER_ORIGIN}/${handle}/status/${id}`;
}

function profileUrl(screenName: string): string {
  return `${TWITTER_ORIGIN}/${screenName}`;
}

function asUserNode(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (raw.__typename === "UserUnavailable") return null;
  const result = isRecord(raw.result) ? raw.result : raw;
  if (result.__typename === "UserUnavailable") return null;
  return isRecord(result) ? result : null;
}

function idStr(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

export function mapGraphqlUser(raw: unknown): TWITTER_USER | null {
  const user = asUserNode(raw);
  if (!user) return null;

  const core = isRecord(user.core) ? user.core : {};
  const legacy = isRecord(user.legacy) ? user.legacy : {};
  const screenName = str(core.screen_name) ?? str(legacy.screen_name);
  const restId = idStr(user.rest_id) ?? str(legacy.id_str);
  if (!screenName || !restId) return null;

  const counts = isRecord(user.relationship_counts)
    ? user.relationship_counts
    : {};
  const tweetCounts = isRecord(user.tweet_counts) ? user.tweet_counts : {};
  const avatar = isRecord(user.avatar) ? user.avatar : {};
  const banner = isRecord(user.banner) ? user.banner : {};
  const bio = isRecord(user.profile_bio) ? user.profile_bio : {};
  const loc = isRecord(user.location) ? user.location : {};
  const website = isRecord(user.website) ? user.website : {};
  const privacy = isRecord(user.privacy) ? user.privacy : {};
  const verification = isRecord(user.verification) ? user.verification : {};
  const pinned = isRecord(user.pinned_items) ? user.pinned_items : {};
  const pinnedIds = Array.isArray(pinned.tweet_ids_str)
    ? pinned.tweet_ids_str.filter((id): id is string => typeof id === "string")
    : [];

  return {
    id: restId,
    screenName,
    name: str(core.name) ?? str(legacy.name) ?? screenName,
    url: profileUrl(screenName),
    avatarUrl: str(avatar.image_url) ?? str(legacy.profile_image_url_https),
    bannerUrl: str(banner.image_url) ?? str(legacy.profile_banner_url),
    description: str(bio.description) ?? str(legacy.description),
    location: str(loc.location) ?? str(legacy.location),
    website: str(website.url) ?? str(legacy.url),
    followers: num(counts.followers) ?? num(legacy.followers_count),
    following: num(counts.following) ?? num(legacy.friends_count),
    tweets: num(tweetCounts.tweets) ?? num(legacy.statuses_count),
    mediaTweets: num(tweetCounts.media_tweets) ?? num(legacy.media_count),
    createdAt: str(core.created_at) ?? str(legacy.created_at),
    isBlueVerified: bool(user.is_blue_verified),
    verifiedType: str(verification.verified_type),
    protected: bool(privacy.protected) || bool(legacy.protected),
    pinnedTweetIds: pinnedIds,
  };
}

function mapAuthor(raw: unknown): TWITTER_TWEET_AUTHOR | null {
  const user = mapGraphqlUser(
    isRecord(raw) && isRecord(raw.user_results) ? raw.user_results : raw,
  );
  if (!user) return null;
  return {
    id: user.id,
    screenName: user.screenName,
    name: user.name,
    avatarUrl: user.avatarUrl,
    isBlueVerified: user.isBlueVerified,
  };
}

function mapMetrics(legacy: Record<string, unknown>, views: unknown): TWITTER_TWEET_METRICS {
  const viewObj = isRecord(views) ? views : {};
  return {
    likes: num(legacy.favorite_count),
    retweets: num(legacy.retweet_count),
    replies: num(legacy.reply_count),
    quotes: num(legacy.quote_count),
    bookmarks: num(legacy.bookmark_count),
    views: num(viewObj.count),
  };
}

export function unwrapTweetNode(raw: unknown): Record<string, unknown> | null {
  if (!isRecord(raw)) return null;
  if (raw.__typename === "Tweet") return raw;
  if (raw.__typename === "TweetWithVisibilityResults") {
    return unwrapTweetNode(raw.tweet);
  }
  if (isRecord(raw.tweet_results)) {
    return unwrapTweetNode(raw.tweet_results.result);
  }
  if (isRecord(raw.itemContent)) {
    return unwrapTweetNode(raw.itemContent);
  }
  if (isRecord(raw.result) && raw.result.__typename) {
    return unwrapTweetNode(raw.result);
  }
  return null;
}

export function mapGraphqlTweet(raw: unknown): TWITTER_TWEET | null {
  const tweet = unwrapTweetNode(raw);
  if (!tweet) return null;
  const id = str(tweet.rest_id) ?? str(isRecord(tweet.legacy) ? tweet.legacy.id_str : null);
  if (!id) return null;
  const legacy = isRecord(tweet.legacy) ? tweet.legacy : {};
  const core = isRecord(tweet.core) ? tweet.core : {};
  const author = mapAuthor(core);
  const note = isRecord(tweet.note_tweet) ? tweet.note_tweet : {};
  const noteResult = isRecord(note.note_tweet_results)
    ? note.note_tweet_results
    : {};
  const noteInner = isRecord(noteResult.result) ? noteResult.result : {};
  const text = str(noteInner.text) ?? str(legacy.full_text) ?? str(legacy.text);

  return {
    id,
    url: tweetUrl(author?.screenName ?? null, id),
    text,
    createdAt: str(legacy.created_at),
    lang: str(legacy.lang),
    conversationId: str(legacy.conversation_id_str),
    isQuote: bool(legacy.is_quote_status),
    author,
    metrics: mapMetrics(legacy, tweet.views),
  };
}

export function mapSyndicationTweet(raw: unknown): TWITTER_TWEET | null {
  if (!isRecord(raw)) return null;
  const id = str(raw.id_str);
  if (!id) return null;
  const user = isRecord(raw.user) ? raw.user : {};
  const screenName = str(user.screen_name);
  const author: TWITTER_TWEET_AUTHOR | null = str(user.id_str)
    ? {
        id: str(user.id_str)!,
        screenName: screenName ?? "i",
        name: str(user.name) ?? screenName ?? "i",
        avatarUrl: str(user.profile_image_url_https),
        isBlueVerified: bool(user.is_blue_verified),
      }
    : null;

  return {
    id,
    url: tweetUrl(screenName, id),
    text: str(raw.text),
    createdAt: str(raw.created_at),
    lang: str(raw.lang),
    conversationId: id,
    isQuote: false,
    author,
    metrics: {
      likes: num(raw.favorite_count),
      retweets: null,
      replies: num(raw.conversation_count),
      quotes: null,
      bookmarks: null,
      views: null,
    },
  };
}

export function extractTimelineTweets(raw: unknown): {
  items: TWITTER_TWEET[];
  cursor: string | null;
} {
  const items: TWITTER_TWEET[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!isRecord(node)) return;

    if (
      (node.__typename === "TimelineTimelineCursor" ||
        node.entryType === "TimelineTimelineCursor") &&
      node.cursorType === "Bottom" &&
      typeof node.value === "string"
    ) {
      cursor = node.value;
    }

    const mapped = mapGraphqlTweet(node);
    if (mapped && !seen.has(mapped.id)) {
      seen.add(mapped.id);
      items.push(mapped);
      return;
    }

    for (const child of Object.values(node)) walk(child);
  };

  walk(raw);
  return { items, cursor };
}

export function mapTrendEntries(raw: unknown): {
  location: { name: string | null; woeid: number };
  asOf: string | null;
  items: TWITTER_TREND[];
} {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!isRecord(row)) {
    return {
      location: { name: null, woeid: TWITTER_WOEID_WORLDWIDE },
      asOf: null,
      items: [],
    };
  }
  const loc = Array.isArray(row.locations) ? row.locations[0] : null;
  const locRec = isRecord(loc) ? loc : {};
  const trends = Array.isArray(row.trends) ? row.trends : [];
  const items: TWITTER_TREND[] = [];
  for (const trend of trends) {
    if (!isRecord(trend)) continue;
    const name = str(trend.name);
    if (!name) continue;
    items.push({
      name,
      query: str(trend.query),
      url: str(trend.url),
      tweetVolume: num(trend.tweet_volume),
    });
  }
  return {
    location: {
      name: str(locRec.name),
      woeid: num(locRec.woeid) ?? TWITTER_WOEID_WORLDWIDE,
    },
    asOf: str(row.as_of),
    items,
  };
}

