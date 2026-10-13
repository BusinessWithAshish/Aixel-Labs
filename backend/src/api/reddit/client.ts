import {
  REDDIT_CACHE_TTL_MS,
  REDDIT_ERROR_MESSAGES,
  REDDIT_SEARCH_TYPE,
  REDDIT_TIMED_SORTS,
  REDDIT_USER_CONTENT,
  REDDIT_VIRTUAL_SUBREDDITS,
  REDDIT_WEB_ORIGIN,
  type RedditSearchType,
  type RedditUserContent,
} from "./constants";
import {
  flattenComments,
  isRecord,
  isShareLink,
  listingAfter,
  listingChildren,
  mapComment,
  mapPost,
  mapRules,
  mapSubreddit,
  mapUser,
  parsePostId,
  parseSubreddit,
  parseUsername,
} from "./compute";
import {
  cachedReddit,
  RedditApiError,
  redditGet,
  resolveShareLink,
  withRedditSession,
} from "./helpers";
import type {
  REDDIT_FEED_REQUEST,
  REDDIT_FEED_RESPONSE,
  REDDIT_POST,
  REDDIT_POST_REQUEST,
  REDDIT_POST_RESPONSE,
  REDDIT_SEARCH_REQUEST,
  REDDIT_SEARCH_RESPONSE,
  REDDIT_SUBREDDIT,
  REDDIT_SUBREDDIT_REQUEST,
  REDDIT_SUBREDDIT_RESPONSE,
  REDDIT_USER,
  REDDIT_USER_ITEM,
  REDDIT_USER_REQUEST,
  REDDIT_USER_RESPONSE,
  REDDIT_WIKI_REQUEST,
  REDDIT_WIKI_RESPONSE,
} from "./types";

function requireSubreddit(input: string): string {
  const name = parseSubreddit(input);
  if (!name) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_SUBREDDIT, 400);
  return name;
}

function requireUsername(input: string): string {
  const name = parseUsername(input);
  if (!name) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_USER, 400);
  return name;
}

function mapPosts(raw: unknown): REDDIT_POST[] {
  return listingChildren(raw)
    .filter((c) => c.kind === "t3")
    .map((c) => mapPost(c.data))
    .filter((p): p is REDDIT_POST => !!p);
}

function timeParam(sort: string, time: string): string | undefined {
  return REDDIT_TIMED_SORTS.has(sort) ? time : undefined;
}

export async function fetchRedditFeed(
  input: REDDIT_FEED_REQUEST,
): Promise<REDDIT_FEED_RESPONSE> {
  const subreddit = requireSubreddit(input.subreddit);
  return cachedReddit("feed", input, REDDIT_CACHE_TTL_MS.FEED, () =>
    withRedditSession(input.country, async (ctx) => {
      const raw = await redditGet(
        ctx,
        `/r/${subreddit}/${input.sort}`,
        {
          limit: input.limit,
          after: input.after,
          t: timeParam(input.sort, input.time),
          geo_filter: subreddit.toLowerCase() === "popular" ? input.country : undefined,
        },
        REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND,
      );
      const items = mapPosts(raw);
      // Reddit answers unknown subreddits with an empty 200 Listing.
      if (
        items.length === 0 &&
        !input.after &&
        !REDDIT_VIRTUAL_SUBREDDITS.has(subreddit.toLowerCase())
      ) {
        const about = await redditGet(
          ctx,
          `/r/${subreddit}/about`,
          undefined,
          REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND,
        );
        if (!isRecord(about) || !isRecord(about.data) || !mapSubreddit(about.data)) {
          throw new RedditApiError(REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND, 404);
        }
      }
      return { subreddit, sort: input.sort, items, after: listingAfter(raw) };
    }),
  );
}

export async function fetchRedditPost(
  input: REDDIT_POST_REQUEST,
): Promise<REDDIT_POST_RESPONSE> {
  return cachedReddit("post", input, REDDIT_CACHE_TTL_MS.POST, () =>
    withRedditSession(input.country, async (ctx) => {
      const source = isShareLink(input.post)
        ? await resolveShareLink(ctx, input.post)
        : input.post;
      const postId = parsePostId(source);
      if (!postId) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_POST, 400);

      const raw = await redditGet<unknown[]>(
        ctx,
        `/comments/${postId}`,
        {
          sort: input.commentSort,
          limit: input.commentLimit > 0 ? input.commentLimit : 1,
          depth: input.depth,
          showmore: true,
        },
        REDDIT_ERROR_MESSAGES.POST_NOT_FOUND,
      );
      if (!Array.isArray(raw) || raw.length === 0) {
        throw new RedditApiError(REDDIT_ERROR_MESSAGES.POST_NOT_FOUND, 404);
      }
      const post = mapPosts(raw[0])[0];
      if (!post) throw new RedditApiError(REDDIT_ERROR_MESSAGES.POST_NOT_FOUND, 404);
      if (input.commentLimit === 0) return { post, comments: [], more: [] };
      const { comments, more } = flattenComments(raw[1], input.commentLimit);
      return { post, comments, more };
    }),
  );
}

export async function fetchRedditSubreddit(
  input: REDDIT_SUBREDDIT_REQUEST,
): Promise<REDDIT_SUBREDDIT_RESPONSE> {
  const name = requireSubreddit(input.subreddit);
  if (REDDIT_VIRTUAL_SUBREDDITS.has(name.toLowerCase())) {
    throw new RedditApiError(REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND, 404);
  }
  return cachedReddit("subreddit", input, REDDIT_CACHE_TTL_MS.SUBREDDIT, () =>
    withRedditSession(input.country, async (ctx) => {
      const about = await redditGet(
        ctx,
        `/r/${name}/about`,
        undefined,
        REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND,
      );
      const subreddit =
        isRecord(about) && isRecord(about.data) ? mapSubreddit(about.data) : null;
      if (!subreddit) {
        throw new RedditApiError(REDDIT_ERROR_MESSAGES.SUBREDDIT_NOT_FOUND, 404);
      }
      const rules = input.includeRules
        ? mapRules(
            await redditGet(ctx, `/r/${name}/about/rules`).catch(() => null),
          )
        : [];
      return { ...subreddit, rules };
    }),
  );
}

function userItems(raw: unknown): REDDIT_USER_ITEM[] {
  const items: REDDIT_USER_ITEM[] = [];
  for (const child of listingChildren(raw)) {
    if (child.kind === "t3") {
      const post = mapPost(child.data);
      if (post) items.push({ kind: "post", ...post });
    } else if (child.kind === "t1") {
      const comment = mapComment(child.data);
      if (comment) items.push({ kind: "comment", ...comment });
    }
  }
  return items;
}

export async function fetchRedditUser(
  input: REDDIT_USER_REQUEST,
): Promise<REDDIT_USER_RESPONSE> {
  const username = requireUsername(input.username);
  const content = input.content as RedditUserContent;
  return cachedReddit("user", input, REDDIT_CACHE_TTL_MS.USER, () =>
    withRedditSession(input.country, async (ctx) => {
      const about = await redditGet(
        ctx,
        `/user/${username}/about`,
        undefined,
        REDDIT_ERROR_MESSAGES.USER_NOT_FOUND,
      );
      const user =
        isRecord(about) && isRecord(about.data) ? mapUser(about.data) : null;
      if (!user) throw new RedditApiError(REDDIT_ERROR_MESSAGES.USER_NOT_FOUND, 404);

      const path =
        content === REDDIT_USER_CONTENT.OVERVIEW
          ? `/user/${username}/overview`
          : `/user/${username}/${content}`;
      const raw = user.isSuspended
        ? null
        : await redditGet(ctx, path, {
            sort: input.sort,
            t: timeParam(input.sort, input.time),
            limit: input.limit,
            after: input.after,
          });
      return {
        user,
        content,
        items: raw ? userItems(raw) : [],
        after: raw ? listingAfter(raw) : null,
      };
    }),
  );
}

export async function fetchRedditSearch(
  input: REDDIT_SEARCH_REQUEST,
): Promise<REDDIT_SEARCH_RESPONSE> {
  const type = input.type as RedditSearchType;
  const subreddit = input.subreddit ? requireSubreddit(input.subreddit) : null;
  return cachedReddit("search", input, REDDIT_CACHE_TTL_MS.SEARCH, () =>
    withRedditSession(input.country, async (ctx) => {
      if (type === REDDIT_SEARCH_TYPE.SUBREDDIT) {
        const raw = await redditGet(ctx, "/subreddits/search", {
          q: input.query,
          limit: input.limit,
          after: input.after,
          include_over_18: input.includeNsfw,
        });
        const items = listingChildren(raw)
          .map((c) => mapSubreddit(c.data))
          .filter((s): s is REDDIT_SUBREDDIT => !!s);
        return { type, query: input.query, items, after: listingAfter(raw) };
      }

      if (type === REDDIT_SEARCH_TYPE.USER) {
        const raw = await redditGet(ctx, "/users/search", {
          q: input.query,
          limit: input.limit,
          after: input.after,
        });
        const items = listingChildren(raw)
          .map((c) => mapUser(c.data))
          .filter((u): u is REDDIT_USER => !!u);
        return { type, query: input.query, items, after: listingAfter(raw) };
      }

      const raw = await redditGet(ctx, subreddit ? `/r/${subreddit}/search` : "/search", {
        q: input.query,
        restrict_sr: subreddit ? true : undefined,
        sort: input.sort,
        t: input.time,
        limit: input.limit,
        after: input.after,
        include_over_18: input.includeNsfw,
        type: "link",
      });
      const items = mapPosts(raw).filter((p) => input.includeNsfw || !p.isNsfw);
      return { type, query: input.query, items, after: listingAfter(raw) };
    }),
  );
}

export async function fetchRedditWiki(
  input: REDDIT_WIKI_REQUEST,
): Promise<REDDIT_WIKI_RESPONSE> {
  const subreddit = requireSubreddit(input.subreddit);
  const page = input.page.replace(/^\/+|\/+$/g, "");
  return cachedReddit("wiki", input, REDDIT_CACHE_TTL_MS.WIKI, () =>
    withRedditSession(input.country, async (ctx) => {
      const raw = await redditGet(
        ctx,
        `/r/${subreddit}/wiki/${page}`,
        undefined,
        REDDIT_ERROR_MESSAGES.WIKI_NOT_FOUND,
      );
      const data = isRecord(raw) && isRecord(raw.data) ? raw.data : null;
      const markdown = data && typeof data.content_md === "string" ? data.content_md : null;
      if (markdown === null) {
        throw new RedditApiError(REDDIT_ERROR_MESSAGES.WIKI_NOT_FOUND, 404);
      }
      const revisedBy =
        data && isRecord(data.revision_by) && isRecord(data.revision_by.data)
          ? data.revision_by.data.name
          : null;
      return {
        subreddit,
        page,
        url: `${REDDIT_WEB_ORIGIN}/r/${subreddit}/wiki/${page}`,
        markdown,
        revisionAt:
          data && typeof data.revision_date === "number"
            ? new Date(data.revision_date * 1000).toISOString()
            : null,
        revisionBy: typeof revisedBy === "string" ? revisedBy : null,
      };
    }),
  );
}
