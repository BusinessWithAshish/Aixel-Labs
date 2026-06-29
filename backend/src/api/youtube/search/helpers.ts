import {
  YOUTUBE_SCRAPE_HEADERS,
  YOUTUBE_SEARCH_FILTER_SP,
} from "../constants";
import { getYoutubeInitData } from "../helpers";
import {
  YOUTUBE_INNERTUBE_SEARCH_URL,
  YOUTUBE_SEARCH_BASE_URL,
  YOUTUBE_SEARCH_DEFAULT_LIMIT,
} from "./constants";
import type {
  YOUTUBE_SEARCH_CONTINUATION_RESPONSE,
  YOUTUBE_SEARCH_RAW_RESPONSE,
  YOUTUBE_SEARCH_RAW_RESPONSE_ITEM,
  YOUTUBE_SEARCH_REQUEST,
  YOUTUBE_SEARCH_RESPONSE,
  YOUTUBE_SEARCH_RESPONSE_ITEM,
  YOUTUBE_SEARCH_SECTION_ITEM,
} from "./types";

function joinRuns(runs?: Array<{ text: string }>): string | null {
  if (!runs?.length) return null;
  const text = runs.map((r) => r.text).join("");
  return text || null;
}

function lengthTextToDuration(lengthText: string | null): number | null {
  if (!lengthText) return null;

  const trimmed = lengthText.trim();
  if (!/^\d/.test(trimmed)) return null;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return null;

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return null;
}

export function mapSearchResponseItem(
  item: YOUTUBE_SEARCH_RAW_RESPONSE_ITEM,
): YOUTUBE_SEARCH_RESPONSE_ITEM {
  const lengthText = item.lengthText?.simpleText ?? null;
  const ownerRun = item.ownerText?.runs?.[0];
  const browseEndpoint = ownerRun?.navigationEndpoint?.browseEndpoint;

  const description = item.detailedMetadataSnippets?.[0]?.snippetText?.runs
    ? joinRuns(item.detailedMetadataSnippets[0].snippetText.runs)
    : null;

  const channelLogoUrl =
    item.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer
      ?.thumbnail?.thumbnails?.[0]?.url ?? null;

  const channelUrl = browseEndpoint?.canonicalBaseUrl
    ? `${YOUTUBE_SEARCH_BASE_URL}${browseEndpoint.canonicalBaseUrl}`
    : null;

  return {
    id: item.videoId ?? null,
    videoId: item.videoId ?? null,
    title: joinRuns(item.title?.runs),
    channelId: browseEndpoint?.browseId ?? null,
    channelUrl,
    lengthText,
    publishedTimeText: item.publishedTimeText?.simpleText ?? null,
    channelLogoUrl,
    description,
    duration: lengthTextToDuration(lengthText),
    thumbnails: item.thumbnail?.thumbnails ?? null,
  };
}

function extractVideoItems(
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[],
): YOUTUBE_SEARCH_RESPONSE_ITEM[] {
  const items: YOUTUBE_SEARCH_RESPONSE_ITEM[] = [];

  for (const sectionItem of sectionItems) {
    if ("itemSectionRenderer" in sectionItem) {
      items.push(
        ...extractVideoItems(sectionItem.itemSectionRenderer.contents),
      );
      continue;
    }

    if ("videoRenderer" in sectionItem) {
      items.push(mapSearchResponseItem(sectionItem.videoRenderer));
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
  apiToken: string,
  context: unknown,
  continuationToken: string,
): Promise<{
  sectionItems: YOUTUBE_SEARCH_SECTION_ITEM[];
  continuationToken: string | null;
}> {
  const url = `${YOUTUBE_INNERTUBE_SEARCH_URL}?key=${encodeURIComponent(apiToken)}&prettyPrint=false`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...YOUTUBE_SCRAPE_HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      context,
      continuation: continuationToken,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `YouTube search continuation failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as YOUTUBE_SEARCH_CONTINUATION_RESPONSE;
  return parseContinuationResponse(data);
}

export async function fetchYoutubeSearch(
  params: YOUTUBE_SEARCH_REQUEST,
): Promise<YOUTUBE_SEARCH_RESPONSE> {
  const { query, filter, limit = YOUTUBE_SEARCH_DEFAULT_LIMIT } = params;

  const url = new URL("/results", YOUTUBE_SEARCH_BASE_URL);
  url.searchParams.set("search_query", query);

  if (filter) {
    const sp = YOUTUBE_SEARCH_FILTER_SP[filter];
    if (sp) {
      url.searchParams.set("sp", decodeURIComponent(sp));
    }
  }

  const pageData = await getYoutubeInitData(url.toString());
  const initdata = pageData.initdata as unknown as YOUTUBE_SEARCH_RAW_RESPONSE;

  const sectionContents =
    initdata.contents.twoColumnSearchResultsRenderer.primaryContents
      .sectionListRenderer.contents;

  const items = extractVideoItems(
    sectionContents[0].itemSectionRenderer.contents,
  );

  let continuationToken: string | null =
    sectionContents[1].continuationItemRenderer.continuationEndpoint
      .continuationCommand.token;

  const requestContext =
    pageData.context ??
    ({
      client: {
        clientName: "WEB",
        clientVersion: "2.20260626.01.00",
        hl: "en",
        gl: "US",
      },
    } as const);

  while (items.length < limit && continuationToken && pageData.apiToken) {
    const nextPage = await fetchSearchContinuation(
      pageData.apiToken,
      requestContext,
      continuationToken,
    );

    const nextItems = extractVideoItems(nextPage.sectionItems);
    if (nextItems.length === 0) break;

    items.push(...nextItems);
    continuationToken = nextPage.continuationToken;
  }

  const limitedItems = items.slice(0, limit);
  const estimatedResults = initdata.estimatedResults
    ? Number.parseInt(initdata.estimatedResults, 10)
    : null;

  return {
    items: limitedItems,
    searchQuery: query,
    estimatedResults: Number.isNaN(estimatedResults) ? null : estimatedResults,
    totalResults: limitedItems.length,
  };
}
