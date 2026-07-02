import {
  YOUTUBE_BASE_URL,
  YOUTUBE_DEFAULT_LIMIT,
  YOUTUBE_INNERTUBE_SEARCH_URL,
  YOUTUBE_SEARCH_FILTER_SP,
  YT_SEARCH_FILTER,
} from "../constants";
import {
  abbreviatedCountTextToNumber,
  buildInnertubeContext,
  createYoutubeFetchSession,
  durationTextToSeconds,
  extractInnertubeClientVersion,
  extractYtInitialDataFromHtml,
  joinYoutubeTextRuns,
  postInnertube,
  resolveYoutubeGeo,
  viewsTextToNumber,
} from "../helpers";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import {
  YOUTUBE_SEARCH_QUERY_PARAM,
  YOUTUBE_SEARCH_RESULTS_PATH,
} from "./constants";
import type {
  YOUTUBE_SEARCH_CHANNEL_ITEM,
  YOUTUBE_SEARCH_CONTINUATION_RESPONSE,
  YOUTUBE_SEARCH_RAW_CHANNEL_ITEM,
  YOUTUBE_SEARCH_RAW_RESPONSE,
  YOUTUBE_SEARCH_RAW_VIDEO_ITEM,
  YOUTUBE_SEARCH_REQUEST,
  YOUTUBE_SEARCH_RESPONSE,
  YOUTUBE_SEARCH_RESPONSE_ITEM,
  YOUTUBE_SEARCH_SECTION_ITEM,
  YOUTUBE_SEARCH_VIDEO_ITEM,
} from "./types";

async function fetchYoutubeSearchPage(
  session: UrlFetchSession,
  url: string,
): Promise<{
  initdata: YOUTUBE_SEARCH_RAW_RESPONSE;
  clientVersion: string;
}> {
  const response = await session.get(url);
  if (!response.ok) {
    throw new Error(`YouTube page request failed: ${response.status}`);
  }

  const html = await response.text();

  return {
    initdata: extractYtInitialDataFromHtml<YOUTUBE_SEARCH_RAW_RESPONSE>(html),
    clientVersion: extractInnertubeClientVersion(html),
  };
}

function mapVideoSearchItem(
  item: YOUTUBE_SEARCH_RAW_VIDEO_ITEM,
): YOUTUBE_SEARCH_VIDEO_ITEM {
  const lengthText = item.lengthText?.simpleText ?? null;
  const ownerRun = item.ownerText?.runs?.[0];
  const browseEndpoint = ownerRun?.navigationEndpoint?.browseEndpoint;

  const description = item.detailedMetadataSnippets?.[0]?.snippetText?.runs
    ? joinYoutubeTextRuns(item.detailedMetadataSnippets[0].snippetText.runs)
    : null;

  const channelLogoUrl =
    item.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer
      ?.thumbnail?.thumbnails?.[0]?.url ?? null;

  const channelUrl = browseEndpoint?.canonicalBaseUrl
    ? `${YOUTUBE_BASE_URL}${browseEndpoint.canonicalBaseUrl}`
    : null;

  const viewCountText = item.viewCountText?.simpleText ?? null;

  return {
    id: item.videoId ?? null,
    videoId: item.videoId ?? null,
    title: joinYoutubeTextRuns(item.title?.runs),
    channelId: browseEndpoint?.browseId ?? null,
    channelUrl,
    lengthText,
    publishedTimeText: item.publishedTimeText?.simpleText ?? null,
    channelLogoUrl,
    description,
    duration: durationTextToSeconds(lengthText),
    thumbnails: item.thumbnail?.thumbnails ?? null,
    viewCountText,
    viewCount: viewsTextToNumber(viewCountText),
  };
}

function mapChannelSearchItem(
  item: YOUTUBE_SEARCH_RAW_CHANNEL_ITEM,
): YOUTUBE_SEARCH_CHANNEL_ITEM {
  const browseEndpoint = item.navigationEndpoint?.browseEndpoint;
  const channelUrl = browseEndpoint?.canonicalBaseUrl
    ? `${YOUTUBE_BASE_URL}${browseEndpoint.canonicalBaseUrl}`
    : null;

  const subscriberCountText = item.videoCountText?.simpleText ?? null;

  const isVerified =
    item.ownerBadges?.some(
      (badge) =>
        badge.metadataBadgeRenderer?.style === "BADGE_STYLE_TYPE_VERIFIED",
    ) ?? false;

  return {
    channelId: item.channelId,
    title:
      item.title?.simpleText ??
      joinYoutubeTextRuns(item.shortBylineText?.runs) ??
      null,
    handle: item.subscriberCountText?.simpleText ?? null,
    channelUrl,
    description: joinYoutubeTextRuns(item.descriptionSnippet?.runs),
    thumbnails: item.thumbnail?.thumbnails ?? null,
    subscriberCountText,
    subscribers: abbreviatedCountTextToNumber(subscriberCountText),
    isVerified,
  };
}

function extractSearchItems(
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[],
  filter: YT_SEARCH_FILTER,
): YOUTUBE_SEARCH_RESPONSE_ITEM[] {
  const items: YOUTUBE_SEARCH_RESPONSE_ITEM[] = [];

  for (const sectionItem of sectionItems) {
    if ("itemSectionRenderer" in sectionItem) {
      items.push(
        ...extractSearchItems(sectionItem.itemSectionRenderer.contents, filter),
      );
      continue;
    }

    if (
      filter === YT_SEARCH_FILTER.CHANNEL &&
      "channelRenderer" in sectionItem
    ) {
      items.push(mapChannelSearchItem(sectionItem.channelRenderer));
      continue;
    }

    if (filter !== YT_SEARCH_FILTER.CHANNEL && "videoRenderer" in sectionItem) {
      items.push(mapVideoSearchItem(sectionItem.videoRenderer));
    }
  }

  return items;
}

function extractContinuationToken(
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[],
): string | null {
  for (const sectionItem of sectionItems) {
    if ("continuationItemRenderer" in sectionItem) {
      return sectionItem.continuationItemRenderer.continuationEndpoint
        .continuationCommand.token;
    }

    if ("itemSectionRenderer" in sectionItem) {
      const nestedToken = extractContinuationToken(
        sectionItem.itemSectionRenderer.contents,
      );
      if (nestedToken) return nestedToken;
    }
  }

  return null;
}

function parseContinuationResponse(
  data: YOUTUBE_SEARCH_CONTINUATION_RESPONSE,
): {
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[];
  continuationToken: string | null;
} {
  for (const command of data.onResponseReceivedCommands ?? []) {
    const sectionItems =
      command.appendContinuationItemsAction?.continuationItems ?? [];

    if (sectionItems.length > 0) {
      return {
        sectionItems,
        continuationToken: extractContinuationToken(sectionItems),
      };
    }
  }

  return { sectionItems: [], continuationToken: null };
}

async function fetchSearchContinuation(
  session: UrlFetchSession,
  gl: string,
  clientVersion: string,
  continuationToken: string,
): Promise<{
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[];
  continuationToken: string | null;
}> {
  const data = await postInnertube<YOUTUBE_SEARCH_CONTINUATION_RESPONSE>(
    session,
    YOUTUBE_INNERTUBE_SEARCH_URL,
    {
      context: buildInnertubeContext(clientVersion, gl),
      continuation: continuationToken,
    },
    "YouTube search continuation",
  );

  return parseContinuationResponse(data);
}

export async function fetchYoutubeSearch(
  params: YOUTUBE_SEARCH_REQUEST,
): Promise<YOUTUBE_SEARCH_RESPONSE> {
  const {
    query,
    country,
    region,
    filter = YT_SEARCH_FILTER.VIDEO,
    limit = YOUTUBE_DEFAULT_LIMIT,
  } = params;

  const { gl } = resolveYoutubeGeo({ country, region });

  const url = new URL(YOUTUBE_SEARCH_RESULTS_PATH, YOUTUBE_BASE_URL);
  url.searchParams.set(YOUTUBE_SEARCH_QUERY_PARAM, query);

  const sp = YOUTUBE_SEARCH_FILTER_SP[filter];
  if (sp) {
    url.searchParams.set("sp", decodeURIComponent(sp));
  }

  const session = await createYoutubeFetchSession({ country, region });

  try {
    const { initdata, clientVersion } = await fetchYoutubeSearchPage(
      session,
      url.toString(),
    );

    const sectionContents =
      initdata.contents.twoColumnSearchResultsRenderer.primaryContents
        .sectionListRenderer.contents;

    const items = extractSearchItems(sectionContents, filter);
    let continuationToken = extractContinuationToken(sectionContents);

    while (items.length < limit && continuationToken) {
      const nextPage = await fetchSearchContinuation(
        session,
        gl,
        clientVersion,
        continuationToken,
      );

      const nextItems = extractSearchItems(nextPage.sectionItems, filter);
      if (nextItems.length === 0) break;

      items.push(...nextItems);
      continuationToken = nextPage.continuationToken;
    }

    const limitedItems = items.slice(0, limit);
    const estimatedResults = initdata.estimatedResults
      ? Number.parseInt(initdata.estimatedResults, 10)
      : null;

    return {
      resultType: filter,
      items: limitedItems,
      searchQuery: query,
      estimatedResults: Number.isNaN(estimatedResults)
        ? null
        : estimatedResults,
      totalResults: limitedItems.length,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
