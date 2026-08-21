import {
  YOUTUBE_INNERTUBE_NEXT_URL,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import {
  buildInnertubeContext,
  fetchYoutubeWatchPageContext,
  postInnertube,
} from "../helpers";
import type { UrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type { YOUTUBE_COMMENTS_NEXT_RESPONSE } from "./types";

export async function fetchCommentsNext(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuation: string,
): Promise<YOUTUBE_COMMENTS_NEXT_RESPONSE> {
  return postInnertube<YOUTUBE_COMMENTS_NEXT_RESPONSE>(
    session,
    YOUTUBE_INNERTUBE_NEXT_URL,
    {
      context: buildInnertubeContext(clientVersion, gl),
      continuation,
    },
    "YouTube comments next",
  );
}

export async function fetchWatchPageRoot(
  session: UrlFetchSession,
  videoId: string,
): Promise<unknown> {
  const { initialData } = await fetchYoutubeWatchPageContext(
    session,
    YOUTUBE_VIDEO_URL(videoId),
  );
  return initialData;
}
