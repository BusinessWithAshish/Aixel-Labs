import { IG_HEADERS, INSTAGRAM_BASE_URL } from "../constants";
import { extractUsername, instagramProfileUrl } from "../compute/username";
import {
  closeUrlFetchSession,
  createUrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import {
  RETRY_BASE_DELAY_MS,
  jitter,
  shouldRetryHttpStatus,
  sleep,
} from "../../../utils/fetch-session-common";
import {
  IG_ADVANCED_ERROR_MESSAGES,
  IG_ADVANCED_POSTS_LIMITS,
  IG_FEED_USER_BY_USERNAME_PATH,
} from "./constants";
import { mapFeedItem, mapFeedUser } from "./compute";
import type {
  IG_ADVANCED_POST,
  IG_ADVANCED_POSTS_REQUEST,
  IG_ADVANCED_POSTS_RESPONSE,
  IgFeedUserTimelineResponse,
} from "./types";

const FEED_MAX_RETRIES = 4;

function pickCsrfFromHtml(html: string): string | undefined {
  return (
    html.match(/"csrf_token"\s*:\s*"([^"]+)"/)?.[1] ??
    html.match(/{"token":"([^"]+)","claim"/)?.[1]
  );
}

function feedByUsernameUrl(
  username: string,
  count: number,
  cursor?: string,
): string {
  const base = `${INSTAGRAM_BASE_URL}${IG_FEED_USER_BY_USERNAME_PATH}/${encodeURIComponent(username)}/username/?count=${count}`;
  if (!cursor) return base;
  return `${base}&max_id=${encodeURIComponent(cursor)}`;
}

/**
 * Fetch public profile Posts-tab media (initial page + optional scroll pages).
 * Uses the same REST endpoint Instagram web fires on profile load / infinite scroll.
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

  const session = await createUrlFetchSession({
    headers: {
      ...IG_HEADERS,
      referer: INSTAGRAM_BASE_URL,
    },
  });

  try {
    // Seed cookie jar (csrftoken / mid) the way the browser does before XHRs.
    const profileRes = await session.get(instagramProfileUrl(username), {
      followRedirects: true,
    });
    const profileHtml = await profileRes.text();
    if (profileRes.status >= 400) {
      throw new Error(
        `${IG_ADVANCED_ERROR_MESSAGES.FEED_FAILED} (profile HTTP ${profileRes.status})`,
      );
    }

    const csrf = pickCsrfFromHtml(profileHtml);
    const apiHeaders: Record<string, string> = {
      ...IG_HEADERS,
      referer: instagramProfileUrl(username),
      origin: INSTAGRAM_BASE_URL,
      ...(csrf
        ? {
            "x-csrftoken": csrf,
            cookie: `csrftoken=${csrf}`,
          }
        : {}),
    };

    const posts: IG_ADVANCED_POST[] = [];
    let cursor = input.cursor;
    let hasNextPage = false;
    let endCursor: string | null = null;
    let userId: string | null = null;
    let pagesFetched = 0;

    for (let page = 0; page < pages; page++) {
      if (page > 0) await sleep(jitter(350));

      const url = feedByUsernameUrl(username, count, cursor);
      let body: IgFeedUserTimelineResponse | null = null;
      let lastErr: Error | null = null;

      for (let attempt = 1; attempt <= FEED_MAX_RETRIES; attempt++) {
        if (attempt > 1) {
          await sleep(jitter(RETRY_BASE_DELAY_MS * 2 ** (attempt - 2)));
        }

        const res = await session.get(url, {
          followRedirects: true,
          headers: apiHeaders,
        });
        const text = await res.text();

        if (res.status >= 400) {
          lastErr = new Error(
            `${IG_ADVANCED_ERROR_MESSAGES.FEED_FAILED} (HTTP ${res.status}: ${text.slice(0, 180)})`,
          );
          if (
            !shouldRetryHttpStatus(res.status) ||
            attempt === FEED_MAX_RETRIES
          ) {
            throw lastErr;
          }
          continue;
        }

        try {
          body = JSON.parse(text) as IgFeedUserTimelineResponse;
          lastErr = null;
          break;
        } catch {
          lastErr = new Error(
            `${IG_ADVANCED_ERROR_MESSAGES.FEED_FAILED} (non-JSON body)`,
          );
          if (attempt === FEED_MAX_RETRIES) throw lastErr;
        }
      }

      if (!body) {
        throw lastErr ?? new Error(IG_ADVANCED_ERROR_MESSAGES.FEED_FAILED);
      }

      pagesFetched++;
      const mappedUser = mapFeedUser(body.user);
      if (mappedUser?.id) userId = mappedUser.id;

      const items = body.items ?? [];
      for (const item of items) {
        posts.push(mapFeedItem(item));
        if (!userId) {
          const fromItem = mapFeedUser(item.user);
          if (fromItem?.id) userId = fromItem.id;
        }
      }

      hasNextPage = Boolean(body.more_available);
      endCursor = body.next_max_id ?? null;
      cursor = endCursor ?? undefined;

      if (!hasNextPage || !endCursor) break;
    }

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
  } finally {
    await closeUrlFetchSession(session);
  }
}
