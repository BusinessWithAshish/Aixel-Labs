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

function extractCommentsHeaderCountFromItems(
  items: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[],
): number | null {
  for (const item of items) {
    const runs =
      item.itemSectionRenderer?.header?.commentsHeaderRenderer?.countText
        ?.runs;
    const text = joinYoutubeTextRuns(runs);
    if (!text || text === "Comments") continue;

    return abbreviatedCountTextToNumber(text) ?? parseNumericString(text);
  }

  return null;
}

/**
 * Walk ytInitialData's `contents.twoColumnWatchNextResults.results.results`
 * and normalize into the same primary-item shape as `extractWatchNextPrimaryItems`.
 * Used as a fallback when the InnerTube `get_watch` POST omits a section that the
 * watch-page HTML still carries (comments, view-count text, etc.).
 */
function extractWatchNextPrimaryItemsFromInitialData(
  initialData: Record<string, unknown> | undefined,
): YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[] {
  if (!initialData) return [];

  const contents =
    (initialData as {
      contents?: {
        twoColumnWatchNextResults?: {
          results?: {
            results?:
              | { contents?: unknown[] }
              | Array<{ contents?: unknown[] }>;
          };
        };
      };
    })?.contents?.twoColumnWatchNextResults?.results?.results;

  if (!contents) return [];

  if (Array.isArray(contents)) {
    // Shape B (legacy): array of panels each with contents
    const items: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[] = [];
    for (const panel of contents) {
      if (panel && typeof panel === "object" && "contents" in panel) {
        const panelContents = (panel as { contents?: unknown[] }).contents;
        if (Array.isArray(panelContents)) {
          items.push(...(panelContents as YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[]));
        }
      }
    }
    return items;
  }

  return Array.isArray(contents.contents)
    ? (contents.contents as YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[])
    : [];
}

/**
 * Extract YouTube's formatted view-count text (e.g. `"11,997 views"`) from the
 * watch-next primary info. `playerResponse.videoDetails.viewCount` is just the
 * raw numeric string (e.g. `"11997"`), so we walk the `videoPrimaryInfoRenderer`
 * for the human-readable `simpleText` that YouTube actually renders on the page.
 */
function extractViewCountTextFromItems(
  items: YOUTUBE_VIDEO_WATCH_NEXT_PRIMARY_ITEM[],
): string | null {
  for (const item of items) {
    const simple =
      item.videoPrimaryInfoRenderer?.viewCount?.videoViewCountRenderer?.viewCount
        ?.simpleText;
    if (simple?.trim()) return simple.trim();
  }
  return null;
}

function extractViewCountText(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  initialData?: Record<string, unknown>,
): string | null {
  const fromWatchNext = extractViewCountTextFromItems(
    extractWatchNextPrimaryItems(data),
  );
  if (fromWatchNext) return fromWatchNext;

  const fromInitial = extractViewCountTextFromItems(
    extractWatchNextPrimaryItemsFromInitialData(initialData),
  );
  return fromInitial;
}

function extractCommentsHeaderCount(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): number | null {
  return extractCommentsHeaderCountFromItems(extractWatchNextPrimaryItems(data));
}

/**
 * Walk ytInitialData's `contents.twoColumnWatchNextResults.results.results`
 * for a comments header. The watch-page HTML always carries the comments
 * section even when `get_watch` omits it, so this is a more reliable
 * fallback than the engagement-panel path for videos where the InnerTube
 * `get_watch` response has no comments panel at all.
 */
function extractCommentsHeaderCountFromInitialData(
  initialData: Record<string, unknown> | undefined,
): number | null {
  if (!initialData) return null;
  return extractCommentsHeaderCountFromItems(
    extractWatchNextPrimaryItemsFromInitialData(initialData),
  );
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

  // Last resort: the watch-page ytInitialData carries the comments section
  // header even when get_watch omits it entirely (common for multi-author /
  // collaborator videos). Walk its `contents.twoColumnWatchNextResults.results`
  // path for a commentsHeaderRenderer.countText.
  const fromInitialDataHeader =
    extractCommentsHeaderCountFromInitialData(initialData);
  if (fromInitialDataHeader !== null) return fromInitialDataHeader;

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

export function extractDescriptionFromGetWatch(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  return data[0]?.playerResponse?.videoDetails?.shortDescription?.trim() ?? null;
}

/**
 * Extract the subscriber-count text from a Collaborators dialog's first list
 * item. YouTube returns this inline in `get_watch` for multi-author videos
 * where the legacy `subscriberCountText.simpleText` path is empty.
 *
 * Subtitle shape: `"@freecodecamp • 11.8M subscribers"`
 * Accessibility label shape: `"freeCodeCamp.org - 11.8M subscribers. Go to channel"`
 *
 * Returns the count token (e.g. `"11.8M"`) so `abbreviatedCountTextToNumber`
 * can parse it, or null if no subscriber text is found.
 */
function extractSubscriberCountFromCollaboratorsDialog(
  dialog:
    | {
        panelLoadingStrategy?: {
          inlineContent?: {
            dialogViewModel?: {
              customContent?: {
                listViewModel?: {
                  listItems?: Array<{
                    listItemViewModel?: {
                      subtitle?: { content?: string };
                      rendererContext?: {
                        accessibilityContext?: { label?: string };
                      };
                    };
                  }>;
                };
              };
            };
          };
        };
      }
    | undefined,
): string | null {
  const items =
    dialog?.panelLoadingStrategy?.inlineContent?.dialogViewModel
      ?.customContent?.listViewModel?.listItems ?? [];

  const subscriberRegex = /([\d,.]+\s*[KMB]?)\s*subscribers/i;
  for (const item of items) {
    const subtitle = item.listItemViewModel?.subtitle?.content ?? "";
    const label =
      item.listItemViewModel?.rendererContext?.accessibilityContext?.label ??
      "";

    const subtitleMatch = subtitle.match(subscriberRegex);
    if (subtitleMatch) return subtitleMatch[1].trim();

    const labelMatch = label.match(subscriberRegex);
    if (labelMatch) return labelMatch[1].trim();
  }

  return null;
}

export function extractChannelSubscriberCountText(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
): string | null {
  for (const item of extractWatchNextPrimaryItems(data)) {
    const owner = item.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
    if (!owner) continue;

    // Legacy path: subscriberCountText.simpleText (single-author videos)
    const simple = owner.subscriberCountText?.simpleText;
    if (simple?.trim()) return simple.trim();

    // Newer "collaborators" layout: subscriber count is only inside the
    // inline Collaborators dialog attached to the owner navigation endpoint
    // or the attributed title commandRuns. The first list item is the
    // primary channel.
    const fromNav = extractSubscriberCountFromCollaboratorsDialog(
      owner.navigationEndpoint?.showDialogCommand,
    );
    if (fromNav) return fromNav;

    for (const run of owner.attributedTitle?.commandRuns ?? []) {
      const fromTitle = extractSubscriberCountFromCollaboratorsDialog(
        run.onTap?.innertubeCommand?.showDialogCommand,
      );
      if (fromTitle) return fromTitle;
    }
  }

  return null;
}

export function parsePlayerResponse(
  data: YOUTUBE_VIDEO_GET_WATCH_RESPONSE,
  fallbackVideoId: string,
  initialData?: Record<string, unknown>,
): YOUTUBE_VIDEO_DETAILS_RESPONSE {
  const details = data[0]?.playerResponse?.videoDetails;
  const rawViewCount = details?.viewCount ?? null;
  const numericViewCount = rawViewCount ? Number(rawViewCount) : null;
  const id = details?.videoId ?? fallbackVideoId;

  // Prefer YouTube's own formatted text ("11,997 views") from the watch-next
  // primary info; fall back to a locale-formatted string built from the raw
  // numeric count so the field is never just a bare number like "11997".
  const extractedViewCountText = extractViewCountText(data, initialData);
  const viewCountText =
    extractedViewCountText ??
    (numericViewCount !== null
      ? `${numericViewCount.toLocaleString("en-US")} views`
      : rawViewCount);

  return {
    id,
    videoUrl: YOUTUBE_VIDEO_URL(id),
    title: details?.title ?? null,
    thumbnail: details?.thumbnail?.thumbnails ?? null,
    isLive: Boolean(details?.isLiveContent ?? false),
    channel: details?.author ?? null,
    channelId: details?.channelId ?? "",
    description: details?.shortDescription ?? null,
    viewCount: numericViewCount,
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
