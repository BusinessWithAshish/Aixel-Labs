import { YOUTUBE_VIDEO_URL } from "../constants";
import {
  createYoutubeFetchSession,
  fetchYoutubeWatchPageContext,
  resolveYoutubeGeo,
} from "../helpers";
import { withSharedClientVersion } from "../client-version-cache";
import { closeUrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type { YOUTUBE_GEO_REQUEST } from "../types";
import type {
  YOUTUBE_VIDEO_CHAPTERS_RESPONSE,
  YOUTUBE_VIDEO_DETAILS_RESPONSE,
} from "./types";
import {
  extractChaptersFromGetWatch,
  extractCommentCountFromGetWatch,
  extractLengthSecondsFromGetWatch,
  fetchGetWatch,
  isVideoResolvable,
  parsePlayerResponse,
} from "./get-watch";
import { YoutubeVideoError } from "./errors";
import { fetchYoutubeVideoSuggestedVideos } from "./suggested";

export { YoutubeVideoError } from "./errors";
export {
  extractChaptersFromGetWatch,
  extractChannelSubscriberCountText,
  extractCommentCountFromGetWatch,
  extractDescriptionFromGetWatch,
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
    const { result: data } = await withSharedClientVersion(
      () => createYoutubeFetchSession({ country, region }),
      (clientVersion) => fetchGetWatch(session, clientVersion, gl, videoId),
    );
    assertVideoResolvable(data, videoId);

    // get_watch alone carries the comment count most of the time; only pay
    // for the full watch-page HTML (several hundred KB) when it doesn't —
    // same fallback `fetchYoutubeVideoMeta` already relies on for bulk enrich.
    let initialData: Record<string, unknown> | undefined;
    if (extractCommentCountFromGetWatch(data) === null) {
      try {
        ({ initialData } = await fetchYoutubeWatchPageContext(session, pageUrl));
      } catch {
        // Best-effort — parsePlayerResponse tolerates missing initialData.
      }
    }

    return parsePlayerResponse(data, videoId, initialData);
  } finally {
    await closeUrlFetchSession(session);
  }
}

export async function fetchYoutubeVideoChapters(
  request: YoutubeVideoFetchRequest,
): Promise<YOUTUBE_VIDEO_CHAPTERS_RESPONSE> {
  const { videoId, country, region } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const { result: data } = await withSharedClientVersion(
      () => createYoutubeFetchSession({ country, region }),
      (clientVersion) => fetchGetWatch(session, clientVersion, gl, videoId),
    );
    assertVideoResolvable(data, videoId);

    const details = parsePlayerResponse(data, videoId);
    const durationSeconds =
      details.lengthSeconds ?? extractLengthSecondsFromGetWatch(data) ?? 0;
    const markers = extractChaptersFromGetWatch(data);

    return {
      videoId,
      videoTitle: details.title,
      chapters: markers.map((marker, index) => ({
        title: marker.title,
        startSeconds: marker.startSeconds,
        endSeconds: markers[index + 1]?.startSeconds ?? durationSeconds,
      })),
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
