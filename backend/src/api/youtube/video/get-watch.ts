import {
  YOUTUBE_COMMENTS_DISABLED_MARKER,
  YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS,
  YOUTUBE_INNERTUBE_GET_WATCH_URL,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import {
  abbreviatedCountTextToNumber,
  buildInnertubeContext,
  joinYoutubeTextRuns,
  parseNumericString,
  postInnertube,
} from "../helpers";
import type { UrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type {
  YOUTUBE_VIDEO_DETAILS_RESPONSE,
  YOUTUBE_VIDEO_ENGAGEMENT_PANEL,
  YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM,
} from "./types";

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

function extractLikeCount(data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE): number | null {
  const microformatLike =
    data[0]?.playerResponse?.microformat?.playerMicroformatRenderer?.likeCount;

  return (
    parseNumericString(microformatLike) ?? extractFactoidCount(data, "Likes")
  );
}

function areCommentsDisabled(sources: unknown[]): boolean {
  return sources.some((source) =>
    JSON.stringify(source ?? {}).includes(YOUTUBE_COMMENTS_DISABLED_MARKER),
  );
}

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
  return abbreviatedCountTextToNumber(text) ?? parseNumericString(text);
}

function extractCommentCountFromEngagementPanels(
  panels: YOUTUBE_VIDEO_ENGAGEMENT_PANEL[] | undefined,
): number | null {
  if (!panels?.length) return null;

  for (const panel of panels) {
    const section = panel.engagementPanelSectionListRenderer;
    if (section?.targetId !== YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS.COMMENTS) {
      continue;
    }

    return parseCommentCountText(
      extractEngagementPanelContextualInfoText(section.header),
    );
  }

  const firstSection = panels[0]?.engagementPanelSectionListRenderer;
  if (firstSection?.targetId === YOUTUBE_ENGAGEMENT_PANEL_TARGET_IDS.COMMENTS) {
    return parseCommentCountText(
      extractEngagementPanelContextualInfoText(firstSection.header),
    );
  }

  return null;
}

function extractWatchNextPrimaryItems(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[] {
  const nested =
    data[1]?.watchNextResponse?.contents?.twoColumnWatchNextResults?.results
      ?.results;

  if (!nested) return [];

  // Shape A (current): { contents: [...] }
  if (!Array.isArray(nested)) {
    return Array.isArray(nested.contents) ? nested.contents : [];
  }

  // Shape B (legacy): array of panels each with contents
  const items: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[] = [];
  for (const panel of nested) {
    if (Array.isArray(panel.contents)) {
      items.push(...panel.contents);
    }
  }
  return items;
}

function extractCommentsHeaderCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  for (const item of extractWatchNextPrimaryItems(data)) {
    const runs =
      item.itemSectionRenderer?.header?.commentsHeaderRenderer?.countText
        ?.runs;
    const text = joinYoutubeTextRuns(runs);
    if (!text || text === "Comments") continue;

    return abbreviatedCountTextToNumber(text) ?? parseNumericString(text);
  }

  return null;
}

function extractCommentCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  initialData?: Record<string, unknown>,
): number | null {
  // Prefer real counts before the disabled marker. get_watch often injects
  // "Comments are turned off" under UNPLAYABLE even when ytInitialData still
  // has engagement-panel-comments-section with a contextual count.
  const fromWatch = extractCommentCountFromEngagementPanels(
    data[1]?.watchNextResponse?.engagementPanels,
  );
  if (fromWatch !== null) return fromWatch;

  const fromPage = extractCommentCountFromEngagementPanels(
    initialData?.engagementPanels as
      | YOUTUBE_VIDEO_ENGAGEMENT_PANEL[]
      | undefined,
  );
  if (fromPage !== null) return fromPage;

  const fromFactoidOrHeader =
    extractFactoidCount(data, "Comments") ?? extractCommentsHeaderCount(data);
  if (fromFactoidOrHeader !== null) return fromFactoidOrHeader;

  if (areCommentsDisabled([initialData, data[1]])) return null;

  return null;
}

function extractPublishedAt(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  const microformat =
    data[0]?.playerResponse?.microformat?.playerMicroformatRenderer;
  const raw = microformat?.uploadDate ?? microformat?.publishDate;
  return raw?.trim() ?? null;
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

export function isVideoResolvable(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  requestedVideoId: string,
): boolean {
  const playerResponse = data[0]?.playerResponse;
  if (!playerResponse) return false;

  // Only hard ERROR means deleted/invalid. UNPLAYABLE / LOGIN_REQUIRED often
  // still carry full videoDetails + microformat (proxy/geo soft-blocks).
  if (playerResponse.playabilityStatus?.status === "ERROR") {
    return false;
  }

  const details = playerResponse.videoDetails;
  if (details?.title?.trim()) return true;

  return Boolean(
    details?.videoId === requestedVideoId &&
      (details?.author?.trim() || details?.channelId),
  );
}

export function extractLikeCountFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  return extractLikeCount(data);
}

export function extractCommentCountFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  initialData?: Record<string, unknown>,
): number | null {
  return extractCommentCount(data, initialData);
}

export function extractPublishedAtFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  return extractPublishedAt(data);
}

export function extractLengthSecondsFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  const raw = data[0]?.playerResponse?.videoDetails?.lengthSeconds;
  if (raw === undefined || raw === null) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractChannelSubscriberCountText(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  for (const item of extractWatchNextPrimaryItems(data)) {
    const text =
      item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer
        ?.subscriberCountText?.simpleText;
    if (text?.trim()) return text.trim();
  }

  return null;
}

export function parsePlayerResponse(
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
