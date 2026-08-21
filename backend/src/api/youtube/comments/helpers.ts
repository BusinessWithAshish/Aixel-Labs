import {
  createYoutubeFetchSession,
  resolveYoutubeGeo,
} from "../helpers";
import { withSharedClientVersion } from "../client-version-cache";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import { YoutubeVideoError } from "../video/errors";
import { fetchGetWatch, isVideoResolvable } from "../video/get-watch";
import {
  YOUTUBE_COMMENTS_DEFAULT_LIMIT,
  YOUTUBE_COMMENTS_ERROR_MESSAGES,
  YOUTUBE_COMMENTS_SORT,
} from "./constants";
import {
  extractCommentsBootstrap,
  parseCommentCountText,
  parseCommentsNextResponse,
  resolveCommentsContinuation,
} from "./compute";
import { fetchCommentsNext, fetchWatchPageRoot } from "./fetch";
import type {
  YOUTUBE_COMMENT,
  YOUTUBE_COMMENTS_BOOTSTRAP,
  YOUTUBE_VIDEO_COMMENTS_REQUEST,
  YOUTUBE_VIDEO_COMMENTS_RESPONSE,
} from "./types";

export { YoutubeVideoError } from "../video/errors";

function hasUsableContinuation(bootstrap: YOUTUBE_COMMENTS_BOOTSTRAP): boolean {
  return Boolean(
    bootstrap.defaultContinuation ||
      bootstrap.continuationBySort.top ||
      bootstrap.continuationBySort.newest,
  );
}

async function resolveBootstrap(
  session: UrlFetchSession,
  watchNextRoot: unknown,
  videoId: string,
): Promise<YOUTUBE_COMMENTS_BOOTSTRAP> {
  const fromWatchNext = extractCommentsBootstrap(watchNextRoot);
  if (fromWatchNext.commentsDisabled || hasUsableContinuation(fromWatchNext)) {
    return fromWatchNext;
  }
  return extractCommentsBootstrap(await fetchWatchPageRoot(session, videoId));
}

async function collectComments(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  startToken: string,
  limit: number,
): Promise<{
  comments: YOUTUBE_COMMENT[];
  continuation: string | null;
  commentCountText: string | null;
}> {
  const comments: YOUTUBE_COMMENT[] = [];
  const seen = new Set<string>();
  let continuation: string | null = startToken;
  let commentCountText: string | null = null;

  while (continuation && comments.length < limit) {
    const data = await fetchCommentsNext(
      session,
      clientVersion,
      gl,
      continuation,
    );
    const page = parseCommentsNextResponse(data);
    if (page.commentCountText) commentCountText = page.commentCountText;

    let added = 0;
    for (const comment of page.comments) {
      if (seen.has(comment.commentId)) continue;
      seen.add(comment.commentId);
      comments.push(comment);
      added += 1;
      if (comments.length >= limit) break;
    }

    continuation = page.continuation;
    if (added === 0) break;
  }

  return {
    comments: comments.slice(0, limit),
    continuation,
    commentCountText,
  };
}

export async function fetchYoutubeVideoComments(
  request: YOUTUBE_VIDEO_COMMENTS_REQUEST,
): Promise<YOUTUBE_VIDEO_COMMENTS_RESPONSE> {
  const {
    videoId,
    country,
    region,
    sort = YOUTUBE_COMMENTS_SORT.TOP,
    limit = YOUTUBE_COMMENTS_DEFAULT_LIMIT,
    continuation: requestContinuation,
  } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    if (requestContinuation) {
      const { result } = await withSharedClientVersion(
        () => createYoutubeFetchSession({ country, region }),
        (clientVersion) =>
          collectComments(
            session,
            clientVersion,
            gl,
            requestContinuation,
            limit,
          ),
      );

      return {
        videoId,
        sort,
        commentsDisabled: false,
        commentCount: parseCommentCountText(result.commentCountText),
        commentCountText: result.commentCountText,
        comments: result.comments,
        continuation: result.continuation,
      };
    }

    const { result: data, clientVersion } = await withSharedClientVersion(
      () => createYoutubeFetchSession({ country, region }),
      (cv) => fetchGetWatch(session, cv, gl, videoId),
    );

    if (!isVideoResolvable(data, videoId)) {
      throw new YoutubeVideoError(
        `${YOUTUBE_COMMENTS_ERROR_MESSAGES.NOT_FOUND}: ${videoId}`,
        404,
      );
    }

    const bootstrap = await resolveBootstrap(
      session,
      data[1]?.watchNextResponse,
      videoId,
    );

    if (bootstrap.commentsDisabled) {
      return {
        videoId,
        sort,
        commentsDisabled: true,
        commentCount: 0,
        commentCountText: null,
        comments: [],
        continuation: null,
      };
    }

    const startToken = resolveCommentsContinuation(bootstrap, sort);
    if (!startToken) {
      throw new YoutubeVideoError(
        `${YOUTUBE_COMMENTS_ERROR_MESSAGES.NO_CONTINUATION}: ${videoId}`,
        502,
      );
    }

    const page = await collectComments(
      session,
      clientVersion,
      gl,
      startToken,
      limit,
    );
    const commentCountText =
      page.commentCountText ?? bootstrap.commentCountText;

    return {
      videoId,
      sort,
      commentsDisabled: false,
      commentCount: parseCommentCountText(commentCountText),
      commentCountText,
      comments: page.comments,
      continuation: page.continuation,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
