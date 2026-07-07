import {
  YOUTUBE_CHANNEL_PAGE_URL,
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_INNERTUBE_BROWSE_URL,
  YOUTUBE_VERIFIED_ACCESSIBILITY_MARKER,
} from "../constants";
import {
  abbreviatedCountTextToNumber,
  buildInnertubeContext,
  createYoutubeFetchSession,
  emptyToNull,
  fetchInnertubeClientVersion,
  postInnertube,
  resolveRedirectUrl,
  resolveYoutubeGeo,
  videoCountTextToNumber,
  viewsTextToNumber,
} from "../helpers";
import { extractLastContinuationToken } from "../innertube-continuation";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import {
  YOUTUBE_CHANNEL_CONTENT_PARAMS,
  YOUTUBE_CHANNEL_PLAYLIST_URL,
  YT_CHANNEL_CONTENT_TYPE,
} from "./constants";
import type {
  YOUTUBE_CHANNEL_ABOUT_RESPONSE,
  YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL,
  YOUTUBE_CHANNEL_BROWSE_RESPONSE,
  YOUTUBE_CHANNEL_CONTINUATION_RESPONSE,
  YOUTUBE_CHANNEL_GRID_ITEM,
  YOUTUBE_CHANNEL_INFO,
  YOUTUBE_CHANNEL_LINK,
  YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM,
  YOUTUBE_CHANNEL_PLAYLIST_ITEM,
  YOUTUBE_CHANNEL_PLAYLIST_LOCKUP,
  YOUTUBE_CHANNEL_FETCH_REQUEST,
  YOUTUBE_CHANNEL_RESPONSE,
  YOUTUBE_CHANNEL_SHORT_ITEM,
  YOUTUBE_CHANNEL_SHORTS_LOCKUP,
  YOUTUBE_CHANNEL_VIDEO_ITEM,
  YOUTUBE_CHANNEL_VIDEO_LOCKUP,
} from "./types";

function getEngagementPanelToken(
  command:
    | {
        showEngagementPanelEndpoint?: {
          engagementPanel?: {
            engagementPanelSectionListRenderer?: {
              content?: {
                sectionListRenderer?: {
                  contents?: Array<{
                    itemSectionRenderer?: {
                      contents?: Array<{
                        continuationItemRenderer?: {
                          continuationEndpoint?: {
                            continuationCommand?: { token?: string };
                          };
                        };
                      }>;
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
  const token =
    command?.showEngagementPanelEndpoint?.engagementPanel
      ?.engagementPanelSectionListRenderer?.content?.sectionListRenderer
      ?.contents?.[0]?.itemSectionRenderer?.contents?.[0]
      ?.continuationItemRenderer?.continuationEndpoint?.continuationCommand
      ?.token;
  return token ?? null;
}

function extractAboutContinuationToken(
  data: YOUTUBE_CHANNEL_BROWSE_RESPONSE,
): string | null {
  const header = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  if (!header) return null;

  const fromLinks = getEngagementPanelToken(
    header.attribution?.attributionViewModel?.suffix?.commandRuns?.[0]?.onTap
      ?.innertubeCommand,
  );
  if (fromLinks) return fromLinks;

  return getEngagementPanelToken(
    header.description?.descriptionPreviewViewModel?.rendererContext
      ?.commandContext?.onTap?.innertubeCommand,
  );
}

function parseAboutLinks(
  about: YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL,
): YOUTUBE_CHANNEL_LINK[] | null {
  const links: YOUTUBE_CHANNEL_LINK[] = [];

  for (const item of about.links ?? []) {
    const linkVm = item.channelExternalLinkViewModel;
    const title = emptyToNull(linkVm?.title?.content);
    const rawUrl =
      linkVm?.link?.commandRuns?.[0]?.onTap?.innertubeCommand?.urlEndpoint?.url;
    if (!title || !rawUrl) continue;

    links.push({
      title,
      displayUrl: emptyToNull(linkVm?.link?.content),
      url: resolveRedirectUrl(rawUrl),
    });
  }

  return links.length > 0 ? links : null;
}

function parseAboutChannelResponse(
  data: YOUTUBE_CHANNEL_ABOUT_RESPONSE,
): YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL | null {
  const actions = [
    ...(data.onResponseReceivedEndpoints ?? []),
    ...(data.onResponseReceivedActions ?? []),
    ...(data.onResponseReceivedCommands ?? []),
  ];

  for (const action of actions) {
    const about =
      action.appendContinuationItemsAction?.continuationItems?.[0]
        ?.aboutChannelRenderer?.metadata?.aboutChannelViewModel;
    if (about) return about;
  }

  return null;
}

function mapChannelInfo(
  data: YOUTUBE_CHANNEL_BROWSE_RESPONSE,
  about: YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL | null,
): YOUTUBE_CHANNEL_INFO | null {
  const channel = data.metadata?.channelMetadataRenderer;
  const header = data.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
  if (!channel && !header) return null;

  const headerRows =
    header?.metadata?.contentMetadataViewModel?.metadataRows ?? [];
  const handle = headerRows[0]?.metadataParts?.[0]?.text?.content ?? null;
  const subscriberCountText =
    headerRows[1]?.metadataParts?.[0]?.text?.content ??
    about?.subscriberCountText ??
    null;
  const videoCountText =
    headerRows[1]?.metadataParts?.[1]?.text?.content ?? null;
  const totalViewsText = about?.viewCountText ?? null;

  const verifiedLabel =
    header?.title?.dynamicTextViewModel?.rendererContext?.accessibilityContext
      ?.label;

  return {
    title:
      header?.title?.dynamicTextViewModel?.text?.content ??
      data.header?.pageHeaderRenderer?.pageTitle ??
      channel?.title ??
      null,
    description: emptyToNull(channel?.description),
    descriptionPreview: emptyToNull(
      header?.description?.descriptionPreviewViewModel?.description?.content,
    ),
    channelId: channel?.externalId ?? null,
    channelUrl: channel?.channelUrl ?? null,
    handle: emptyToNull(handle ?? undefined),
    handleUrl: channel?.vanityChannelUrl ?? null,
    avatar:
      header?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image
        ?.sources ??
      channel?.avatar?.thumbnails ??
      null,
    banner: header?.banner?.imageBannerViewModel?.image?.sources ?? null,
    isVerified: verifiedLabel
      ? verifiedLabel.includes(YOUTUBE_VERIFIED_ACCESSIBILITY_MARKER)
      : null,
    isFamilySafe: channel?.isFamilySafe ?? null,
    subscriberCountText,
    subscribers: abbreviatedCountTextToNumber(subscriberCountText),
    videoCountText,
    videoCount: abbreviatedCountTextToNumber(videoCountText),
    totalViewsText,
    totalViews: abbreviatedCountTextToNumber(totalViewsText),
    joinedDateText: emptyToNull(about?.joinedDateText?.content),
    country: emptyToNull(about?.country),
    rssUrl: channel?.rssUrl ?? null,
    keywords: emptyToNull(channel?.keywords),
    links: about ? parseAboutLinks(about) : null,
  };
}

async function fetchInnertubeClientVersionForChannel(
  session: UrlFetchSession,
  channelId: string,
): Promise<string> {
  return fetchInnertubeClientVersion(
    session,
    YOUTUBE_CHANNEL_PAGE_URL(channelId),
  );
}

function parseShortsAccessibilityText(accessibilityText: string | undefined): {
  title: string | null;
  viewsText: string | null;
} {
  if (!accessibilityText) return { title: null, viewsText: null };

  const commaIndex = accessibilityText.indexOf(", ");
  if (commaIndex === -1) {
    return { title: accessibilityText.trim() || null, viewsText: null };
  }

  const title = accessibilityText.slice(0, commaIndex).trim() || null;
  const remainder = accessibilityText.slice(commaIndex + 2);
  const viewsMatch = remainder.match(/^(.+?)\s*-\s*play Short$/i);
  const viewsText =
    (viewsMatch?.[1] ?? remainder.split(" - ")[0])?.trim() || null;

  return { title, viewsText };
}

function extractShortVideoId(
  shorts: YOUTUBE_CHANNEL_SHORTS_LOCKUP,
): string | null {
  const fromEndpoint =
    shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
  if (fromEndpoint) return fromEndpoint;

  const entityId = shorts.entityId;
  if (!entityId) return null;

  const match = entityId.match(/^shorts-shelf-item-(.+)$/);
  return match?.[1] ?? null;
}

function extractShortsThumbnail(
  shorts: YOUTUBE_CHANNEL_SHORTS_LOCKUP,
): YOUTUBE_CHANNEL_SHORT_ITEM["thumbnail"] {
  return (
    shorts.thumbnailViewModel?.thumbnailViewModel?.image?.sources ??
    shorts.onTap?.innertubeCommand?.reelWatchEndpoint?.thumbnail?.thumbnails ??
    null
  );
}

function mapVideoLockup(
  lockup: YOUTUBE_CHANNEL_VIDEO_LOCKUP,
): YOUTUBE_CHANNEL_VIDEO_ITEM | null {
  const videoId = lockup.contentId;
  if (!videoId) return null;

  const metadata = lockup.metadata?.lockupMetadataViewModel;
  const metadataParts =
    metadata?.metadata?.contentMetadataViewModel?.metadataRows?.[0]
      ?.metadataParts ?? [];

  const viewsText = metadataParts[0]?.text?.content ?? null;
  const publishedText = metadataParts[1]?.text?.content ?? null;

  return {
    videoId,
    title: metadata?.title?.content ?? null,
    thumbnail: lockup.contentImage?.thumbnailViewModel?.image?.sources ?? null,
    viewsText,
    views: viewsTextToNumber(viewsText),
    publishedText,
  };
}

function mapShortsLockup(
  shorts: YOUTUBE_CHANNEL_SHORTS_LOCKUP,
): YOUTUBE_CHANNEL_SHORT_ITEM | null {
  const shortId = extractShortVideoId(shorts);
  if (!shortId) return null;

  const fromAccessibility = parseShortsAccessibilityText(
    shorts.accessibilityText,
  );
  const viewsText =
    shorts.overlayMetadata?.secondaryText?.content ??
    fromAccessibility.viewsText;

  return {
    shortId,
    title:
      shorts.overlayMetadata?.primaryText?.content ?? fromAccessibility.title,
    thumbnail: extractShortsThumbnail(shorts),
    viewsText,
    views: viewsTextToNumber(viewsText),
    publishedText: null,
  };
}

function mapVideoRichItem(
  item: YOUTUBE_CHANNEL_GRID_ITEM,
): YOUTUBE_CHANNEL_VIDEO_ITEM | null {
  if (!("richItemRenderer" in item)) return null;

  const lockup = item.richItemRenderer.content?.lockupViewModel;
  if (!lockup) return null;

  return mapVideoLockup(lockup);
}

function mapShortRichItem(
  item: YOUTUBE_CHANNEL_GRID_ITEM,
): YOUTUBE_CHANNEL_SHORT_ITEM | null {
  if (!("richItemRenderer" in item)) return null;

  const shorts = item.richItemRenderer.content?.shortsLockupViewModel;
  if (!shorts) return null;

  return mapShortsLockup(shorts);
}

function extractPlaylistThumbnail(
  lockup: YOUTUBE_CHANNEL_PLAYLIST_LOCKUP,
): YOUTUBE_CHANNEL_PLAYLIST_ITEM["thumbnail"] {
  return (
    lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail
      ?.thumbnailViewModel?.image?.sources ??
    lockup.contentImage?.thumbnailViewModel?.image?.sources ??
    null
  );
}

function extractPlaylistVideoCountText(
  lockup: YOUTUBE_CHANNEL_PLAYLIST_LOCKUP,
): string | null {
  const overlays =
    lockup.contentImage?.collectionThumbnailViewModel?.primaryThumbnail
      ?.thumbnailViewModel?.overlays ?? [];

  for (const overlay of overlays) {
    for (const badge of overlay.thumbnailOverlayBadgeViewModel
      ?.thumbnailBadges ?? []) {
      const text = badge.thumbnailBadgeViewModel?.text?.trim();
      if (text) return text;
    }
  }

  return null;
}

function extractPlaylistWatchEndpoint(
  lockup: YOUTUBE_CHANNEL_PLAYLIST_LOCKUP,
): { videoId?: string; playlistId?: string } | null {
  return (
    lockup.itemPlayback?.inlinePlayerData?.onSelect?.innertubeCommand
      ?.watchEndpoint ??
    lockup.rendererContext?.commandContext?.onTap?.innertubeCommand
      ?.watchEndpoint ??
    null
  );
}

function mapPlaylistLockup(
  lockup: YOUTUBE_CHANNEL_PLAYLIST_LOCKUP,
): YOUTUBE_CHANNEL_PLAYLIST_ITEM | null {
  const playlistId = lockup.contentId;
  if (!playlistId) return null;

  const watchEndpoint = extractPlaylistWatchEndpoint(lockup);
  const videoCountText = extractPlaylistVideoCountText(lockup);

  return {
    playlistId,
    title: lockup.metadata?.lockupMetadataViewModel?.title?.content ?? null,
    thumbnail: extractPlaylistThumbnail(lockup),
    videoCountText,
    videoCount: videoCountTextToNumber(videoCountText),
    firstVideoId: watchEndpoint?.videoId ?? null,
    playlistUrl: YOUTUBE_CHANNEL_PLAYLIST_URL(playlistId),
  };
}

function parsePlaylistGridItems(
  items: YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM[],
): YOUTUBE_CHANNEL_PLAYLIST_ITEM[] {
  const playlists: YOUTUBE_CHANNEL_PLAYLIST_ITEM[] = [];

  for (const item of items) {
    if (!item.lockupViewModel) continue;
    const playlist = mapPlaylistLockup(item.lockupViewModel);
    if (playlist) playlists.push(playlist);
  }

  return playlists;
}

function channelHasPlaylistsTab(
  data: YOUTUBE_CHANNEL_BROWSE_RESPONSE,
): boolean {
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];

  return tabs.some(
    (tab) => tab.tabRenderer?.title?.trim().toLowerCase() === "playlists",
  );
}

function findPlaylistGridItems(
  data: YOUTUBE_CHANNEL_BROWSE_RESPONSE,
): YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM[] {
  if (!channelHasPlaylistsTab(data)) return [];

  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];

  const collectFromTab = (
    tab: (typeof tabs)[number],
  ): YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM[] => {
    const sections =
      tab.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
    const items: YOUTUBE_CHANNEL_PLAYLIST_GRID_ITEM[] = [];

    for (const section of sections) {
      for (const sectionContent of section.itemSectionRenderer?.contents ??
        []) {
        const gridItems = sectionContent.gridRenderer?.items ?? [];
        items.push(...gridItems);
      }
    }

    return items;
  };

  for (const tab of tabs) {
    if (!tab.tabRenderer?.selected) continue;
    const items = collectFromTab(tab);
    if (items.length) return items;
  }

  for (const tab of tabs) {
    const items = collectFromTab(tab);
    if (items.length) return items;
  }

  return [];
}

function parseGridItems(
  gridItems: YOUTUBE_CHANNEL_GRID_ITEM[],
  contentType: YT_CHANNEL_CONTENT_TYPE.SHORTS,
): {
  items: YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
};
function parseGridItems(
  gridItems: YOUTUBE_CHANNEL_GRID_ITEM[],
  contentType: Exclude<
    YT_CHANNEL_CONTENT_TYPE,
    YT_CHANNEL_CONTENT_TYPE.SHORTS | YT_CHANNEL_CONTENT_TYPE.PLAYLISTS
  >,
): {
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  continuationToken: string | null;
};
function parseGridItems(
  gridItems: YOUTUBE_CHANNEL_GRID_ITEM[],
  contentType: YT_CHANNEL_CONTENT_TYPE,
): {
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[] | YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
} {
  const isShorts = contentType === YT_CHANNEL_CONTENT_TYPE.SHORTS;

  if (isShorts) {
    const items: YOUTUBE_CHANNEL_SHORT_ITEM[] = [];

    for (const item of gridItems) {
      const short = mapShortRichItem(item);
      if (short) items.push(short);
    }

    return {
      items,
      continuationToken: extractLastContinuationToken(gridItems),
    };
  }

  const items: YOUTUBE_CHANNEL_VIDEO_ITEM[] = [];

  for (const item of gridItems) {
    const video = mapVideoRichItem(item);
    if (video) items.push(video);
  }

  return { items, continuationToken: extractLastContinuationToken(gridItems) };
}

function findContentGrid(
  data: YOUTUBE_CHANNEL_BROWSE_RESPONSE,
): YOUTUBE_CHANNEL_GRID_ITEM[] {
  const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs ?? [];

  for (const tab of tabs) {
    const renderer = tab.tabRenderer;
    if (!renderer?.selected) continue;

    const contents = renderer.content?.richGridRenderer?.contents;
    if (contents?.length) return contents;
  }

  for (const tab of tabs) {
    const contents = tab.tabRenderer?.content?.richGridRenderer?.contents;
    if (contents?.length) return contents;
  }

  throw new Error("Could not find content grid in channel browse response");
}

function parseContinuationResponse(
  data: YOUTUBE_CHANNEL_CONTINUATION_RESPONSE,
  contentType: YT_CHANNEL_CONTENT_TYPE.SHORTS,
): {
  items: YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
};
function parseContinuationResponse(
  data: YOUTUBE_CHANNEL_CONTINUATION_RESPONSE,
  contentType: Exclude<
    YT_CHANNEL_CONTENT_TYPE,
    YT_CHANNEL_CONTENT_TYPE.SHORTS | YT_CHANNEL_CONTENT_TYPE.PLAYLISTS
  >,
): {
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  continuationToken: string | null;
};
function parseContinuationResponse(
  data: YOUTUBE_CHANNEL_CONTINUATION_RESPONSE,
  contentType: YT_CHANNEL_CONTENT_TYPE,
): {
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[] | YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
} {
  const actions = [
    ...(data.onResponseReceivedActions ?? []),
    ...(data.onResponseReceivedCommands ?? []),
  ];

  for (const action of actions) {
    const continuationItems =
      action.appendContinuationItemsAction?.continuationItems;
    if (continuationItems?.length) {
      if (contentType === YT_CHANNEL_CONTENT_TYPE.SHORTS) {
        return parseGridItems(
          continuationItems,
          YT_CHANNEL_CONTENT_TYPE.SHORTS,
        );
      }

      return parseGridItems(
        continuationItems,
        contentType as Exclude<
          YT_CHANNEL_CONTENT_TYPE,
          YT_CHANNEL_CONTENT_TYPE.SHORTS | YT_CHANNEL_CONTENT_TYPE.PLAYLISTS
        >,
      );
    }
  }

  return { items: [], continuationToken: null };
}

async function postBrowse(
  session: UrlFetchSession,
  body: Record<string, unknown>,
): Promise<unknown> {
  return postInnertube(
    session,
    YOUTUBE_INNERTUBE_BROWSE_URL,
    body,
    "YouTube browse request",
  );
}

async function fetchBrowseFirstPage(
  session: UrlFetchSession,
  channelId: string,
  clientVersion: string,
  gl: string,
  browseParams: string,
): Promise<YOUTUBE_CHANNEL_BROWSE_RESPONSE> {
  return (await postBrowse(session, {
    context: buildInnertubeContext(clientVersion, gl),
    browseId: channelId,
    params: browseParams,
  })) as YOUTUBE_CHANNEL_BROWSE_RESPONSE;
}

async function fetchAboutChannelDetails(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuationToken: string,
): Promise<YOUTUBE_CHANNEL_ABOUT_VIEW_MODEL | null> {
  const data = (await postBrowse(session, {
    context: buildInnertubeContext(clientVersion, gl),
    continuation: continuationToken,
  })) as YOUTUBE_CHANNEL_ABOUT_RESPONSE;

  return parseAboutChannelResponse(data);
}

async function fetchBrowseContinuation(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuationToken: string,
  contentType: YT_CHANNEL_CONTENT_TYPE.SHORTS,
): Promise<{
  items: YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
}>;
async function fetchBrowseContinuation(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuationToken: string,
  contentType: Exclude<
    YT_CHANNEL_CONTENT_TYPE,
    YT_CHANNEL_CONTENT_TYPE.SHORTS | YT_CHANNEL_CONTENT_TYPE.PLAYLISTS
  >,
): Promise<{
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[];
  continuationToken: string | null;
}>;
async function fetchBrowseContinuation(
  session: UrlFetchSession,
  clientVersion: string,
  gl: string,
  continuationToken: string,
  contentType: YT_CHANNEL_CONTENT_TYPE,
): Promise<{
  items: YOUTUBE_CHANNEL_VIDEO_ITEM[] | YOUTUBE_CHANNEL_SHORT_ITEM[];
  continuationToken: string | null;
}> {
  const data = (await postBrowse(session, {
    context: buildInnertubeContext(clientVersion, gl),
    continuation: continuationToken,
  })) as YOUTUBE_CHANNEL_CONTINUATION_RESPONSE;

  if (contentType === YT_CHANNEL_CONTENT_TYPE.SHORTS) {
    return parseContinuationResponse(data, YT_CHANNEL_CONTENT_TYPE.SHORTS);
  }

  return parseContinuationResponse(
    data,
    contentType as Exclude<
      YT_CHANNEL_CONTENT_TYPE,
      YT_CHANNEL_CONTENT_TYPE.SHORTS | YT_CHANNEL_CONTENT_TYPE.PLAYLISTS
    >,
  );
}

export async function fetchYoutubeChannel(
  request: YOUTUBE_CHANNEL_FETCH_REQUEST,
): Promise<YOUTUBE_CHANNEL_RESPONSE> {
  const {
    channelId,
    contentType,
    limit = YOUTUBE_DEFAULT_LIMIT,
    country,
    region,
  } = request;
  const resolvedContentType = contentType ?? YT_CHANNEL_CONTENT_TYPE.VIDEOS;
  const browseParams = YOUTUBE_CHANNEL_CONTENT_PARAMS[resolvedContentType];
  const { gl } = resolveYoutubeGeo({ country, region });

  const session = await createYoutubeFetchSession({ country, region });

  try {
    const clientVersion = await fetchInnertubeClientVersionForChannel(
      session,
      channelId,
    );

    const firstPage = await fetchBrowseFirstPage(
      session,
      channelId,
      clientVersion,
      gl,
      browseParams,
    );

    const aboutToken = extractAboutContinuationToken(firstPage);
    const aboutDetails = aboutToken
      ? await fetchAboutChannelDetails(session, clientVersion, gl, aboutToken)
      : null;

    const channelInfo = mapChannelInfo(firstPage, aboutDetails);

    if (resolvedContentType === YT_CHANNEL_CONTENT_TYPE.PLAYLISTS) {
      const playlistGrid = findPlaylistGridItems(firstPage);
      const playlists = parsePlaylistGridItems(playlistGrid).slice(0, limit);

      return {
        channelId,
        channelInfo,
        contentType: resolvedContentType,
        items: playlists,
        totalResults: playlists.length,
      };
    }

    if (resolvedContentType === YT_CHANNEL_CONTENT_TYPE.SHORTS) {
      const firstGrid = findContentGrid(firstPage);
      const { items: firstItems, continuationToken: firstToken } =
        parseGridItems(firstGrid, YT_CHANNEL_CONTENT_TYPE.SHORTS);

      const items = [...firstItems];
      let continuationToken = firstToken;

      while (items.length < limit && continuationToken) {
        const nextPage = await fetchBrowseContinuation(
          session,
          clientVersion,
          gl,
          continuationToken,
          YT_CHANNEL_CONTENT_TYPE.SHORTS,
        );

        if (nextPage.items.length === 0) break;

        items.push(...nextPage.items);
        continuationToken = nextPage.continuationToken;
      }

      const limitedItems = items.slice(0, limit);

      return {
        channelId,
        channelInfo,
        contentType: resolvedContentType,
        items: limitedItems,
        totalResults: limitedItems.length,
      };
    }

    const firstGrid = findContentGrid(firstPage);
    const { items: firstItems, continuationToken: firstToken } = parseGridItems(
      firstGrid,
      resolvedContentType,
    );

    const items = [...firstItems];
    let continuationToken = firstToken;

    while (items.length < limit && continuationToken) {
      const nextPage = await fetchBrowseContinuation(
        session,
        clientVersion,
        gl,
        continuationToken,
        resolvedContentType,
      );

      if (nextPage.items.length === 0) break;

      items.push(...nextPage.items);
      continuationToken = nextPage.continuationToken;
    }

    const limitedItems = items.slice(0, limit);

    return {
      channelId,
      channelInfo,
      contentType: resolvedContentType,
      items: limitedItems,
      totalResults: limitedItems.length,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
