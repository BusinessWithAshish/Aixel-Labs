import {
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_HANDLER_LABELS,
  YOUTUBE_INNERTUBE_NEXT_URL,
  YOUTUBE_LOCKUP_CONTENT_TYPES,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import {
  buildInnertubeContext,
  createYoutubeFetchSession,
  durationTextToSeconds,
  fetchInnertubeClientVersion,
  postInnertube,
  resolveYoutubeGeo,
  viewsTextToNumber,
} from "../helpers";
import { extractLastContinuationToken } from "../innertube-continuation";
import {
  hasContinuationItemRenderer,
  hasLockupViewModel,
} from "../type-guards";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import { YoutubeVideoError } from "./errors";
import { fetchGetWatch, isVideoResolvable } from "./get-watch";
import type {
  YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  YOUTUBE_VIDEO_LOCKUP,
  YOUTUBE_VIDEO_NEXT_CONTINUATION_RESPONSE,
  YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE,
  YOUTUBE_VIDEO_SUGGESTION_ITEM,
  YOUTUBE_VIDEO_WATCH_NEXT_ITEM,
  YOUTUBE_VIDEO_WATCH_NEXT_RESULTS,
} from "./types";
import type { YOUTUBE_GEO_REQUEST } from "../types";

type YoutubeVideoFetchRequest = YOUTUBE_GEO_REQUEST & {
  videoId: string;
};

function extractLockupDurationText(
  lockup: YOUTUBE_VIDEO_LOCKUP,
): string | null {
  const overlays = lockup.contentImage?.thumbnailViewModel?.overlays ?? [];

  for (const overlay of overlays) {
    for (const badge of overlay.thumbnailBottomOverlayViewModel?.badges ?? []) {
      const text = badge.thumbnailBadgeViewModel?.text?.trim();
      if (text) return text;
    }
  }

  return null;
}

function mapLockupSuggestion(
  lockup: YOUTUBE_VIDEO_LOCKUP,
): YOUTUBE_VIDEO_SUGGESTION_ITEM | null {
  const videoId = lockup.contentId;
  if (!videoId || lockup.contentType !== YOUTUBE_LOCKUP_CONTENT_TYPES.VIDEO) {
    return null;
  }

  const metadata = lockup.metadata?.lockupMetadataViewModel;
  const metadataRows =
    metadata?.metadata?.contentMetadataViewModel?.metadataRows ?? [];

  const channelTitle =
    metadataRows[0]?.metadataParts?.[0]?.text?.content ?? null;
  const statsRow = metadataRows[1]?.metadataParts ?? [];
  const viewsText = statsRow[0]?.text?.content ?? null;
  const publishedText = statsRow[1]?.text?.content ?? null;
  const durationText = extractLockupDurationText(lockup);
  const channelId =
    metadata?.image?.decoratedAvatarViewModel?.rendererContext?.commandContext
      ?.onTap?.innertubeCommand?.browseEndpoint?.browseId ?? null;

  return {
    videoId,
    videoUrl: YOUTUBE_VIDEO_URL(videoId),
    title: metadata?.title?.content ?? null,
    thumbnail: lockup.contentImage?.thumbnailViewModel?.image?.sources ?? null,
    channelTitle,
    channelId,
    viewsText,
    views: viewsTextToNumber(viewsText),
    publishedText,
    durationText,
    duration: durationTextToSeconds(durationText),
  };
}

function flattenWatchNextItems(
  items: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[],
): YOUTUBE_VIDEO_WATCH_NEXT_ITEM[] {
  const flattened: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[] = [];

  for (const item of items) {
    if (hasLockupViewModel(item) || hasContinuationItemRenderer(item)) {
      flattened.push(item);
    }
  }

  return flattened;
}

function collectWatchNextItems(
  contents: YOUTUBE_VIDEO_WATCH_NEXT_RESULTS | undefined,
): YOUTUBE_VIDEO_WATCH_NEXT_ITEM[] {
  const results =
    contents?.twoColumnWatchNextResults?.secondaryResults?.secondaryResults
      ?.results ?? [];

  const items: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[] = [];

  for (const result of results) {
    if (hasLockupViewModel(result) || hasContinuationItemRenderer(result)) {
      items.push(result as YOUTUBE_VIDEO_WATCH_NEXT_ITEM);
      continue;
    }

    items.push(...(result.itemSectionRenderer?.contents ?? []));
  }

  return flattenWatchNextItems(items);
}

function parseWatchNextItems(items: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[]): {
  suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  nextPageToken: string | null;
} {
  const suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[] = [];

  for (const item of items) {
    if (!hasLockupViewModel(item)) continue;
    const suggestion = mapLockupSuggestion(
      item.lockupViewModel as YOUTUBE_VIDEO_LOCKUP,
    );
    if (suggestion) suggestions.push(suggestion);
  }

  return {
    suggestions,
    nextPageToken: extractLastContinuationToken(items),
  };
}

function parseWatchNextResponse(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  videoId: string,
): {
  suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  nextPageToken: string | null;
} {
  const watchNextContents = data[1]?.watchNextResponse?.contents;
  const items = collectWatchNextItems(watchNextContents);
  const result = parseWatchNextItems(items);

  if (result.suggestions.length === 0) {
    console.warn(
      `[${YOUTUBE_HANDLER_LABELS.VIDEO_SUGGESTED}] parseWatchNextResponse returned 0 suggestions`,
      {
        videoId,
        rawItemCount: items.length,
        hasWatchNext: Boolean(watchNextContents),
        hasContinuationToken: Boolean(result.nextPageToken),
      },
    );
  }

  return result;
}

async function fetchWatchNextContinuation(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuationToken: string,
): Promise<{
  suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  nextPageToken: string | null;
}> {
  const data = await postInnertube<YOUTUBE_VIDEO_NEXT_CONTINUATION_RESPONSE>(
    session,
    YOUTUBE_INNERTUBE_NEXT_URL,
    {
      context: buildInnertubeContext(clientVersion, gl),
      continuation: continuationToken,
    },
  );

  const actions = [
    ...(data.onResponseReceivedEndpoints ?? []),
    ...(data.onResponseReceivedCommands ?? []),
  ];

  for (const action of actions) {
    const items = flattenWatchNextItems(
      action.appendContinuationItemsAction?.continuationItems ?? [],
    );
    if (items.length > 0) return parseWatchNextItems(items);
  }

  return { suggestions: [], nextPageToken: null };
}

async function collectSuggestedVideos(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  videoId: string,
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  limit: number,
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const items: YOUTUBE_VIDEO_SUGGESTION_ITEM[] = [];
  const seen = new Set<string>();

  const addSuggestions = (suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[]) => {
    for (const suggestion of suggestions) {
      if (seen.has(suggestion.videoId)) continue;
      seen.add(suggestion.videoId);
      items.push(suggestion);
      if (items.length >= limit) return;
    }
  };

  const initial = parseWatchNextResponse(data, videoId);
  addSuggestions(initial.suggestions);

  let continuationToken = initial.nextPageToken;
  while (continuationToken && items.length < limit) {
    const page = await fetchWatchNextContinuation(
      session,
      clientVersion,
      gl,
      continuationToken,
    );
    addSuggestions(page.suggestions);
    continuationToken = page.nextPageToken;
  }

  return {
    videoId,
    items: items.slice(0, limit),
    totalResults: items.length,
  };
}

function assertVideoResolvable(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  videoId: string,
): void {
  if (!isVideoResolvable(data, videoId)) {
    throw new YoutubeVideoError(
      `Video not found or unavailable: ${videoId}`,
      404,
    );
  }
}

async function fetchSuggestedVideosAttempt(
  request: YoutubeVideoFetchRequest & { limit: number },
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const { videoId, country, region, limit } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const clientVersion = await fetchInnertubeClientVersion(
      session,
      YOUTUBE_VIDEO_URL(videoId),
    );
    const data = await fetchGetWatch(session, clientVersion, gl, videoId);
    assertVideoResolvable(data, videoId);

    return collectSuggestedVideos(
      session,
      clientVersion,
      gl,
      videoId,
      data,
      limit,
    );
  } finally {
    await closeUrlFetchSession(session);
  }
}

export async function fetchYoutubeVideoSuggestedVideos(
  request: YoutubeVideoFetchRequest & { limit?: number },
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const { videoId, limit = YOUTUBE_DEFAULT_LIMIT, ...geo } = request;
  const attemptRequest = { videoId, limit, ...geo };

  const firstAttempt = await fetchSuggestedVideosAttempt(attemptRequest);
  if (firstAttempt.items.length > 0) return firstAttempt;

  console.warn(
    `[${YOUTUBE_HANDLER_LABELS.VIDEO_SUGGESTED}] Retrying after 0 suggestions on resolvable watch page`,
    { videoId, limit },
  );

  const secondAttempt = await fetchSuggestedVideosAttempt(attemptRequest);
  if (secondAttempt.items.length > 0) return secondAttempt;

  throw new YoutubeVideoError(
    `Could not extract suggested videos for ${videoId}`,
    502,
  );
}
