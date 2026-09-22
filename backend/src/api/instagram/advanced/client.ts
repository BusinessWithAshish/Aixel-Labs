import { runWithConcurrency } from "../../youtube/concurrency";
import { extractUsername } from "../compute/username";
import { IG_GRAPHQL_CONCURRENCY, IG_GRAPHQL_PAGE_SIZE } from "../constants";
import {
  fetchLoggedOutMedia,
  igLoggedOutQuery,
  readEmbedNumber,
} from "../graphql";
import {
  IG_ADVANCED_ERROR_MESSAGES,
  IG_ADVANCED_POSTS_LIMITS,
  IG_MEDIA_TYPE,
  IG_POST_EMBED_URL,
  IG_REELS_SCAN_MAX_PAGES,
} from "./constants";
import { mapFeedItem } from "./compute";
import type {
  IG_ADVANCED_POST,
  IG_ADVANCED_POSTS_REQUEST,
  IG_ADVANCED_POSTS_RESPONSE,
  IgFeedItem,
  IgPolarisConnection,
} from "./types";

type TimelineData = {
  xig_user_by_username: {
    pk?: string;
    polaris_ordered_timeline_connection?: IgPolarisConnection<IgFeedItem> | null;
  } | null;
};

type ClipsData = {
  xig_user_by_username: {
    polaris_clips_connection?: IgPolarisConnection<IgFeedItem> | null;
  } | null;
};

/**
 * Fills reel `playCount` from the Reels-tab connection — the only guest
 * surface that still carries it — joined on pk. The tab runs newest first, so
 * the scan stops once it pages past the oldest wanted reel; likes/comments
 * are backfilled too when the post query couldn't load a reel.
 */
async function fillReelCounts(
  username: string,
  posts: IG_ADVANCED_POST[],
): Promise<void> {
  const wanted = new Map<string, IG_ADVANCED_POST>();
  for (const post of posts) {
    if (post.productType === "clips" && post.pk) wanted.set(post.pk, post);
  }
  if (wanted.size === 0) return;
  const oldest = [...wanted.keys()].reduce((min, pk) =>
    BigInt(pk) < BigInt(min) ? pk : min,
  );

  let after: string | undefined;
  for (let page = 0; page < IG_REELS_SCAN_MAX_PAGES && wanted.size > 0; page++) {
    const data = await igLoggedOutQuery<ClipsData>("reels", {
      username,
      first: IG_GRAPHQL_PAGE_SIZE,
      ...(after ? { after } : {}),
    }).catch(() => null);
    const conn = data?.xig_user_by_username?.polaris_clips_connection;
    const edges = conn?.edges ?? [];
    for (const { node } of edges) {
      if (node?.pk == null) continue;
      const pk = String(node.pk);
      const post = wanted.get(pk);
      if (!post) continue;
      post.playCount = node.play_count ?? post.playCount;
      post.likeCount ??= node.like_count ?? null;
      post.commentCount ??= node.comment_count ?? null;
      wanted.delete(pk);
    }
    const lastPk = edges.at(-1)?.node?.pk;
    if (
      !conn?.page_info?.has_next_page ||
      !conn.page_info.end_cursor ||
      lastPk == null ||
      BigInt(lastPk) < BigInt(oldest)
    ) {
      break;
    }
    after = conn.page_info.end_cursor;
  }
}

/**
 * Public profile Posts tab through Instagram's logged-out GraphQL:
 *  1. page the Posts-tab connection until `count × pages` posts are in hand
 *     (the server returns at most 12 per call, so a big `count` is several);
 *  2. load each post's full record — likes, comments, `taken_at`, media URLs,
 *     carousel slides — with the post query, falling back to the thin grid
 *     node when that fails;
 *  3. fill reel play counts from the Reels tab, and every video's view count
 *     from its embed page.
 * The feed/user REST endpoint this replaced now 401s every guest.
 */
export async function fetchInstagramAdvancedPosts(
  input: IG_ADVANCED_POSTS_REQUEST,
): Promise<IG_ADVANCED_POSTS_RESPONSE> {
  const username = extractUsername(input.username);
  if (!username) {
    throw new Error(IG_ADVANCED_ERROR_MESSAGES.INVALID_USERNAME);
  }

  const count = input.count ?? IG_ADVANCED_POSTS_LIMITS.defaultCount;
  const pages = input.pages ?? IG_ADVANCED_POSTS_LIMITS.defaultPages;
  const target = count * pages;

  const nodes: IgFeedItem[] = [];
  let userId: string | null = null;
  let cursor = input.cursor;
  let hasNextPage = false;
  let endCursor: string | null = null;
  let pagesFetched = 0;

  while (nodes.length < target) {
    const data = await igLoggedOutQuery<TimelineData>("posts", {
      username,
      first: Math.min(IG_GRAPHQL_PAGE_SIZE, target - nodes.length),
      ...(cursor ? { after: cursor } : {}),
    });
    const user = data?.xig_user_by_username;
    if (!user) {
      throw new Error(`${IG_ADVANCED_ERROR_MESSAGES.PROFILE_NOT_FOUND} (@${username})`);
    }
    pagesFetched++;
    userId ??= user.pk ?? null;

    const conn = user.polaris_ordered_timeline_connection;
    const edges = conn?.edges ?? [];
    for (const { node } of edges) if (node) nodes.push(node);

    hasNextPage = Boolean(conn?.page_info?.has_next_page);
    endCursor = conn?.page_info?.end_cursor ?? null;
    if (!hasNextPage || !endCursor || edges.length === 0) break;
    cursor = endCursor;
  }

  const posts = await runWithConcurrency(
    nodes,
    IG_GRAPHQL_CONCURRENCY,
    async (node) => {
      const [full, views] = await Promise.all([
        node.pk != null
          ? fetchLoggedOutMedia(String(node.pk)).catch(() => null)
          : null,
        node.media_type === IG_MEDIA_TYPE.VIDEO && node.code
          ? readEmbedNumber(IG_POST_EMBED_URL(node.code), "video_view_count")
          : null,
      ]);
      const post = mapFeedItem(full ?? node);
      post.viewCount ??= views;
      return post;
    },
  );
  await fillReelCounts(username, posts);

  return {
    username,
    userId,
    posts,
    pageInfo: {
      hasNextPage,
      endCursor,
    },
    pagesFetched,
  };
}
