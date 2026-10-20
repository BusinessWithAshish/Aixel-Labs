import { fetch } from "undici";
import {
  REDDIT_ARCHIVE_BUSY_WAIT_MS,
  REDDIT_ARCHIVE_KIND,
  REDDIT_ARCHIVE_ORIGIN,
  REDDIT_ARCHIVE_PAGE_SIZE,
  REDDIT_ARCHIVE_RATE_LIMIT_RETRIES,
  REDDIT_ARCHIVE_SORT,
  REDDIT_ARCHIVE_TIMEOUT_MS,
  REDDIT_ARCHIVE_USER_AGENT,
  REDDIT_CACHE_TTL_MS,
  REDDIT_ERROR_MESSAGES,
  REDDIT_MAX_QUEUE_WAIT_MS,
  type RedditArchiveKind,
} from "./constants";
import {
  isRecord,
  mapComment,
  mapPost,
  parsePostId,
  parseSubreddit,
  parseUsername,
} from "./compute";
import { cachedReddit, RedditApiError } from "./helpers";
import { sleep } from "../../utils/fetch-session-common";
import type {
  REDDIT_ARCHIVE_REQUEST,
  REDDIT_ARCHIVE_RESPONSE,
  REDDIT_COMMENT,
  REDDIT_POST,
} from "./types";

type ArchiveQuery = Record<string, string | number | undefined>;

/**
 * GET one Arctic Shift search page. Its rate limit is dynamic; a 429 names the
 * wait in `X-RateLimit-Reset` (seconds), which is honoured up to the queue cap.
 * A 422 "slow down" is the same thing for heavy keyword queries, without a wait.
 */
async function archiveGet(path: string, query: ArchiveQuery): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const url = `${REDDIT_ARCHIVE_ORIGIN}${path}?${params.toString()}`;

  for (let limited = 0; ; ) {
    // undici's fetch, like the other callers that pass a timeout signal: Vercel's function
    // build types the global fetch's Response as an empty interface here.
    const response = await fetch(url, {
      headers: { "user-agent": REDDIT_ARCHIVE_USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(REDDIT_ARCHIVE_TIMEOUT_MS),
    }).catch((err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      throw new RedditApiError(`${REDDIT_ERROR_MESSAGES.ARCHIVE_FAILED}: ${reason}`);
    });

    const parsed: unknown = await response.json().catch(() => null);
    const error = isRecord(parsed) && typeof parsed.error === "string" ? parsed.error : null;

    const busy = response.status === 422 && !!error && /slow down/i.test(error);
    if (response.status === 429 || busy) {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      const waitMs = busy
        ? REDDIT_ARCHIVE_BUSY_WAIT_MS
        : (Number.isFinite(reset) && reset > 0 ? reset : 5) * 1000 + 500;
      if (++limited > REDDIT_ARCHIVE_RATE_LIMIT_RETRIES || waitMs > REDDIT_MAX_QUEUE_WAIT_MS) {
        throw new RedditApiError(
          `${REDDIT_ERROR_MESSAGES.ARCHIVE_RATE_LIMITED} (retry in ${Math.ceil(waitMs / 1000)}s)`,
          429,
        );
      }
      await sleep(waitMs);
      continue;
    }

    if (!response.ok || error) {
      throw new RedditApiError(
        `${REDDIT_ERROR_MESSAGES.ARCHIVE_FAILED}: ${error ?? response.status}`,
        response.status === 400 ? 400 : 502,
      );
    }
    return isRecord(parsed) && Array.isArray(parsed.data) ? parsed.data.filter(isRecord) : [];
  }
}

function archiveFilters(input: REDDIT_ARCHIVE_REQUEST, kind: RedditArchiveKind): ArchiveQuery {
  const isComment = kind === REDDIT_ARCHIVE_KIND.COMMENT;
  if (input.post && !isComment) {
    throw new RedditApiError(REDDIT_ERROR_MESSAGES.ARCHIVE_POST_SCOPE, 400);
  }

  const subreddit = input.subreddit ? parseSubreddit(input.subreddit) : undefined;
  if (subreddit === null) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_SUBREDDIT, 400);
  const author = input.author ? parseUsername(input.author) : undefined;
  if (author === null) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_USER, 400);
  const postId = input.post ? parsePostId(input.post) : undefined;
  if (postId === null) throw new RedditApiError(REDDIT_ERROR_MESSAGES.BAD_POST, 400);

  if (input.query && !subreddit && !author && !postId) {
    throw new RedditApiError(REDDIT_ERROR_MESSAGES.ARCHIVE_QUERY_SCOPE, 400);
  }

  return {
    subreddit,
    author,
    link_id: postId,
    [isComment ? "body" : "query"]: input.query,
    after: input.after,
    before: input.before,
    sort: input.sort,
  };
}

/**
 * Historical / bulk posts or comments from the Arctic Shift archive — no Reddit
 * request, no proxy. Pages by `created_utc`: `next` goes back in as `cursor`.
 */
export async function fetchRedditArchive(
  input: REDDIT_ARCHIVE_REQUEST,
): Promise<REDDIT_ARCHIVE_RESPONSE> {
  const kind = input.kind as RedditArchiveKind;
  const isComment = kind === REDDIT_ARCHIVE_KIND.COMMENT;
  const filters = archiveFilters(input, kind);
  const cursorKey = input.sort === REDDIT_ARCHIVE_SORT.ASC ? "after" : "before";
  const path = isComment ? "/api/comments/search" : "/api/posts/search";

  return cachedReddit("archive", input, REDDIT_CACHE_TTL_MS.ARCHIVE, async () => {
    const seen = new Set<string>();
    const items: (REDDIT_POST | REDDIT_COMMENT)[] = [];
    let cursor = input.cursor;
    let exhausted = false;

    while (items.length < input.limit && !exhausted) {
      const want = Math.min(REDDIT_ARCHIVE_PAGE_SIZE, input.limit - items.length);
      let rows: Record<string, unknown>[];
      try {
        rows = await archiveGet(path, {
          ...filters,
          ...(cursor ? { [cursorKey]: cursor } : {}),
          limit: want,
        });
      } catch (err) {
        // Rate-limited mid-way: hand back the pages already fetched plus `next`.
        if (items.length > 0 && err instanceof RedditApiError && err.statusCode === 429) break;
        throw err;
      }
      exhausted = rows.length < want;
      for (const row of rows) {
        const item = isComment ? mapComment(row) : mapPost(row);
        if (!item || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
      const last = rows[rows.length - 1]?.created_utc;
      if (typeof last !== "number") break;
      cursor = String(last);
    }

    return {
      kind,
      sort: input.sort,
      items: items as REDDIT_POST[] | REDDIT_COMMENT[],
      next: exhausted || !cursor ? null : cursor,
    };
  });
}
