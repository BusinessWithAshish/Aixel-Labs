import { YOUTUBE_VIDEO_URL } from "../constants";
import {
  createYoutubeFetchSession,
  fetchYoutubeWatchPageContext,
  resolveYoutubeGeo,
} from "../helpers";
import { closeUrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type { YOUTUBE_GEO_REQUEST } from "../types";
import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "./types";
import {
  fetchGetWatch,
  isVideoResolvable,
  parsePlayerResponse,
} from "./get-watch";
import { YoutubeVideoError } from "./errors";
import { fetchYoutubeVideoSuggestedVideos } from "./suggested";

export { YoutubeVideoError } from "./errors";
export {
  extractChannelSubscriberCountText,
  extractCommentCountFromGetWatch,
  extractLengthSecondsFromGetWatch,
  extractLikeCountFromGetWatch,
  extractPublishedAtFromGetWatch,
  fetchGetWatch,
  isVideoResolvable,
  parsePlayerResponse,
} from "./get-watch";
export { fetchYoutubeVideoSuggestedVideos } from "./suggested";

type YoutubeVideoFetchRequest = YOUTUBE_GEO_REQUEST & {
  videoId: string;
};

function assertVideoResolvable(
  data: Awaited<ReturnType<typeof fetchGetWatch>>,
  videoId: string,
): void {
  if (!isVideoResolvable(data, videoId)) {
    throw new YoutubeVideoError(
      `Video not found or unavailable: ${videoId}`,
      404,
    );
  }
}

export async function fetchYoutubeVideoDetails(
  request: YoutubeVideoFetchRequest,
): Promise<YOUTUBE_VIDEO_DETAILS_RESPONSE> {
  const { videoId, country, region } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const pageUrl = YOUTUBE_VIDEO_URL(videoId);
    const { clientVersion, initialData } = await fetchYoutubeWatchPageContext(
      session,
      pageUrl,
    );
    const data = await fetchGetWatch(session, clientVersion, gl, videoId);
    assertVideoResolvable(data, videoId);
    return parsePlayerResponse(data, videoId, initialData);
  } finally {
    await closeUrlFetchSession(session);
  }
}
