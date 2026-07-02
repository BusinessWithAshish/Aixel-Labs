import {
  YOUTUBE_BASE_URL,
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_INNERTUBE_GET_WATCH_URL,
  YOUTUBE_INNERTUBE_NEXT_URL,
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
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import type { YOUTUBE_GEO_REQUEST } from "../types";
import type {
  YOUTUBE_VIDEO_DETAILS_RESPONSE,
  YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  YOUTUBE_VIDEO_LOCKUP,
  YOUTUBE_VIDEO_NEXT_CONTINUATION_RESPONSE,
  YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE,
  YOUTUBE_VIDEO_SUGGESTION_ITEM,
  YOUTUBE_VIDEO_WATCH_NEXT_ITEM,
  YOUTUBE_VIDEO_WATCH_NEXT_RESULTS,
} from "./types";

type YoutubeVideoFetchRequest = YOUTUBE_GEO_REQUEST & {
  videoId: string;
};

async function fetchGetWatch(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  videoId: string,
): Promise<YOUTUBE_VIDEO_GET_WATCH_RESPONSE> {
  const context = buildInnertubeContext(clientVersion, gl);

  return postInnertube(session, YOUTUBE_INNERTUBE_GET_WATCH_URL, {
    context,
    playerRequest: { videoId },
    watchNextRequest: { videoId },
  });
}

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
  if (!videoId || lockup.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO") {
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
    if ("lockupViewModel" in item || "continuationItemRenderer" in item) {
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
    if ("lockupViewModel" in result || "continuationItemRenderer" in result) {
      items.push(result);
      continue;
    }

    items.push(...(result.itemSectionRenderer?.contents ?? []));
  }

  return flattenWatchNextItems(items);
}

function extractContinuationToken(
  items: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[],
): string | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if ("continuationItemRenderer" in item) {
      return item.continuationItemRenderer.continuationEndpoint
        .continuationCommand.token;
    }
  }
  return null;
}

function parseWatchNextItems(items: YOUTUBE_VIDEO_WATCH_NEXT_ITEM[]): {
  suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  nextPageToken: string | null;
} {
  const suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[] = [];

  for (const item of items) {
    if (!("lockupViewModel" in item)) continue;
    const suggestion = mapLockupSuggestion(item.lockupViewModel);
    if (suggestion) suggestions.push(suggestion);
  }

  return {
    suggestions,
    nextPageToken: extractContinuationToken(items),
  };
}

function parsePlayerResponse(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  fallbackVideoId: string,
): YOUTUBE_VIDEO_DETAILS_RESPONSE {
  const details = data[0]?.playerResponse?.videoDetails;
  const viewCountText = details?.viewCount ?? null;

  return {
    id: details?.videoId ?? fallbackVideoId,
    title: details?.title ?? null,
    thumbnail: details?.thumbnail?.thumbnails ?? null,
    isLive: Boolean(details?.isLiveContent ?? false),
    channel: details?.author ?? null,
    channelId: details?.channelId ?? "",
    description: details?.shortDescription ?? null,
    viewCount: viewCountText ? Number(viewCountText) : null,
    viewCountText,
    lengthSeconds: details?.lengthSeconds
      ? Number(details.lengthSeconds)
      : null,
    keywords: details?.keywords ?? [],
  };
}

function parseWatchNextResponse(data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE): {
  suggestions: YOUTUBE_VIDEO_SUGGESTION_ITEM[];
  nextPageToken: string | null;
} {
  const items = collectWatchNextItems(data[1]?.watchNextResponse?.contents);
  return parseWatchNextItems(items);
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

export async function fetchYoutubeVideoDetails(
  request: YoutubeVideoFetchRequest,
): Promise<YOUTUBE_VIDEO_DETAILS_RESPONSE> {
  const { videoId, country, region } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const clientVersion = await fetchInnertubeClientVersion(
      session,
      `${YOUTUBE_BASE_URL}/watch?v=${videoId}`,
    );
    const data = await fetchGetWatch(session, clientVersion, gl, videoId);
    return parsePlayerResponse(data, videoId);
  } finally {
    await closeUrlFetchSession(session);
  }
}

export async function fetchYoutubeVideoSuggestedVideos(
  request: YoutubeVideoFetchRequest & { limit?: number },
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const { videoId, country, region, limit = YOUTUBE_DEFAULT_LIMIT } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const clientVersion = await fetchInnertubeClientVersion(
      session,
      `${YOUTUBE_BASE_URL}/watch?v=${videoId}`,
    );
    const data = await fetchGetWatch(session, clientVersion, gl, videoId);

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

    const initial = parseWatchNextResponse(data);
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
  } finally {
    await closeUrlFetchSession(session);
  }
}
