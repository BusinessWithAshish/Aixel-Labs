import {
  YOUTUBE_BASE_URL,
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_INNERTUBE_GET_WATCH_URL,
  YOUTUBE_INNERTUBE_NEXT_URL,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import {
  buildInnertubeContext,
  createYoutubeFetchSession,
  abbreviatedCountTextToNumber,
  durationTextToSeconds,
  fetchInnertubeClientVersion,
  fetchYoutubeWatchPageContext,
  joinYoutubeTextRuns,
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
  YOUTUBE_VIDEO_ENGAGEMENT_PANEL,
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

export class YoutubeVideoError extends Error {
  constructor(
    message: string,
    readonly statusCode: 404 | 502,
  ) {
    super(message);
    this.name = "YoutubeVideoError";
  }
}

function isVideoResolvable(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  requestedVideoId: string,
): boolean {
  const playerResponse = data[0]?.playerResponse;
  if (!playerResponse) return false;

  const playabilityStatus = playerResponse.playabilityStatus?.status;
  if (
    playabilityStatus === "ERROR" ||
    playabilityStatus === "UNPLAYABLE" ||
    playabilityStatus === "LOGIN_REQUIRED"
  ) {
    return false;
  }

  const details = playerResponse.videoDetails;
  if (details?.title?.trim()) return true;

  return Boolean(
    details?.videoId === requestedVideoId &&
      (details?.author?.trim() || details?.channelId),
  );
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

export async function fetchGetWatch(
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

function parseNumericString(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function extractFactoidCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  label: string,
): number | null {
  const panels = data[1]?.watchNextResponse?.engagementPanels ?? [];

  for (const panel of panels) {
    const items =
      panel.engagementPanelSectionListRenderer?.content
        ?.structuredDescriptionContentRenderer?.items ?? [];

    for (const item of items) {
      const factoids = item.videoDescriptionHeaderRenderer?.factoid ?? [];

      for (const factoid of factoids) {
        const renderer = factoid.factoidRenderer;
        if (renderer?.label?.simpleText !== label) continue;

        const valueText = renderer.value?.simpleText ?? null;
        return (
          abbreviatedCountTextToNumber(valueText) ??
          parseNumericString(valueText)
        );
      }
    }
  }

  return null;
}

export function extractLikeCountFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  return extractLikeCount(data);
}

function extractLikeCount(data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE): number | null {
  const microformatLike =
    data[0]?.playerResponse?.microformat?.playerMicroformatRenderer?.likeCount;

  return (
    parseNumericString(microformatLike) ?? extractFactoidCount(data, "Likes")
  );
}

function areCommentsDisabled(sources: unknown[]): boolean {
  return sources.some((source) =>
    JSON.stringify(source ?? {}).includes("Comments are turned off"),
  );
}

const COMMENTS_ENGAGEMENT_PANEL_TARGET_ID = "engagement-panel-comments-section";

function extractEngagementPanelContextualInfoText(
  header:
    | NonNullable<
        YOUTUBE_VIDEO_ENGAGEMENT_PANEL["engagementPanelSectionListRenderer"]
      >["header"]
    | undefined,
): string | null {
  const renderer = header?.engagementPanelTitleHeaderRenderer;
  if (!renderer) return null;

  const contextual = renderer.contextualInfo ?? renderer.title?.contextualInfo;
  return (
    joinYoutubeTextRuns(contextual?.runs) ?? contextual?.simpleText?.trim() ?? null
  );
}

function parseCommentCountText(text: string | null): number | null {
  if (!text) return null;
  return (
    abbreviatedCountTextToNumber(text) ?? parseNumericString(text)
  );
}

function extractCommentCountFromEngagementPanels(
  panels: YOUTUBE_VIDEO_ENGAGEMENT_PANEL[] | undefined,
): number | null {
  if (!panels?.length) return null;

  for (const panel of panels) {
    const section = panel.engagementPanelSectionListRenderer;
    if (section?.targetId !== COMMENTS_ENGAGEMENT_PANEL_TARGET_ID) continue;

    return parseCommentCountText(
      extractEngagementPanelContextualInfoText(section.header),
    );
  }

  const firstSection = panels[0]?.engagementPanelSectionListRenderer;
  if (firstSection?.targetId === COMMENTS_ENGAGEMENT_PANEL_TARGET_ID) {
    return parseCommentCountText(
      extractEngagementPanelContextualInfoText(firstSection.header),
    );
  }

  return null;
}

function extractCommentsHeaderCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  const panels =
    data[1]?.watchNextResponse?.contents?.twoColumnWatchNextResults?.results
      ?.results ?? [];

  for (const panel of panels) {
    for (const item of panel.contents ?? []) {
      const runs =
        item.itemSectionRenderer?.header?.commentsHeaderRenderer?.countText
          ?.runs;
      const text = joinYoutubeTextRuns(runs);
      if (!text || text === "Comments") continue;

      return (
        abbreviatedCountTextToNumber(text) ?? parseNumericString(text)
      );
    }
  }

  return null;
}

export function extractCommentCountFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  return extractCommentCount(data);
}

function extractCommentCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  initialData?: Record<string, unknown>,
): number | null {
  if (areCommentsDisabled([data[1], initialData])) return null;

  const fromWatch = extractCommentCountFromEngagementPanels(
    data[1]?.watchNextResponse?.engagementPanels,
  );
  if (fromWatch !== null) return fromWatch;

  const fromPage = extractCommentCountFromEngagementPanels(
    initialData?.engagementPanels as YOUTUBE_VIDEO_ENGAGEMENT_PANEL[] | undefined,
  );
  if (fromPage !== null) return fromPage;

  return (
    extractFactoidCount(data, "Comments") ?? extractCommentsHeaderCount(data)
  );
}

export function extractPublishedAtFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  const microformat =
    data[0]?.playerResponse?.microformat?.playerMicroformatRenderer;
  const raw = microformat?.uploadDate ?? microformat?.publishDate;
  return raw?.trim() ?? null;
}

export function extractLengthSecondsFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  const raw = data[0]?.playerResponse?.videoDetails?.lengthSeconds;
  if (raw === undefined || raw === null) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractPublishedAt(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  return extractPublishedAtFromGetWatch(data);
}

export function extractChannelSubscriberCountText(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  const panels =
    data[1]?.watchNextResponse?.contents?.twoColumnWatchNextResults?.results
      ?.results ?? [];

  for (const panel of panels) {
    for (const item of panel.contents ?? []) {
      const text =
        item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer
          ?.subscriberCountText?.simpleText;
      if (text?.trim()) return text.trim();
    }
  }

  return null;
}

function parsePlayerResponse(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  fallbackVideoId: string,
  initialData?: Record<string, unknown>,
): YOUTUBE_VIDEO_DETAILS_RESPONSE {
  const details = data[0]?.playerResponse?.videoDetails;
  const viewCountText = details?.viewCount ?? null;
  const id = details?.videoId ?? fallbackVideoId;

  return {
    id,
    videoUrl: YOUTUBE_VIDEO_URL(id),
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
    publishedAt: extractPublishedAt(data),
    channelSubscribers: abbreviatedCountTextToNumber(
      extractChannelSubscriberCountText(data),
    ),
    likeCount: extractLikeCount(data),
    commentCount: extractCommentCount(data, initialData),
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
      "[YOUTUBE/VIDEO/SUGGESTED] parseWatchNextResponse returned 0 suggestions",
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

async function fetchSuggestedVideosAttempt(
  request: YoutubeVideoFetchRequest & { limit: number },
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const { videoId, country, region, limit } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const clientVersion = await fetchInnertubeClientVersion(
      session,
      `${YOUTUBE_BASE_URL}/watch?v=${videoId}`,
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

export async function fetchYoutubeVideoDetails(
  request: YoutubeVideoFetchRequest,
): Promise<YOUTUBE_VIDEO_DETAILS_RESPONSE> {
  const { videoId, country, region } = request;
  const { gl } = resolveYoutubeGeo({ country, region });
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const pageUrl = `${YOUTUBE_BASE_URL}/watch?v=${videoId}`;
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

export async function fetchYoutubeVideoSuggestedVideos(
  request: YoutubeVideoFetchRequest & { limit?: number },
): Promise<YOUTUBE_VIDEO_SUGGESTED_VIDEOS_RESPONSE> {
  const { videoId, limit = YOUTUBE_DEFAULT_LIMIT, ...geo } = request;
  const attemptRequest = { videoId, limit, ...geo };

  const firstAttempt = await fetchSuggestedVideosAttempt(attemptRequest);
  if (firstAttempt.items.length > 0) return firstAttempt;

  console.warn(
    "[YOUTUBE/VIDEO/SUGGESTED] Retrying after 0 suggestions on resolvable watch page",
    { videoId, limit },
  );

  const secondAttempt = await fetchSuggestedVideosAttempt(attemptRequest);
  if (secondAttempt.items.length > 0) return secondAttempt;

  throw new YoutubeVideoError(
    `Could not extract suggested videos for ${videoId}`,
    502,
  );
}
