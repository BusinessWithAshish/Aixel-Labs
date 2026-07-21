import {
  YOUTUBE_CHANNEL_ID_PATTERN,
  YOUTUBE_HANDLE_PAGE_URL,
} from "../constants";
import {
  abbreviatedCountTextToNumber,
  createYoutubeFetchSession,
  emptyToNull,
  extractYtInitialDataFromHtml,
  normalizeYoutubeHandle,
} from "../helpers";
import { closeUrlFetchSession } from "../../../utils/node-tls-client-session-handler";
import type { YOUTUBE_GEO_REQUEST } from "../types";
import type {
  YOUTUBE_HANDLE_REQUEST,
  YOUTUBE_HANDLE_RESPONSE,
  YOUTUBE_HANDLE_PAGE_INIT_DATA,
} from "./types";

function extractChannelIdFromHtml(html: string): string | null {
  const canonicalMatch = html.match(
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)"/,
  );
  if (canonicalMatch?.[1]) return canonicalMatch[1];

  const channelUrlMatch = html.match(
    /"channelUrl":"https:\\\/\\\/www\.youtube\.com\\\/channel\\\/(UC[^"\\]+)"/,
  );
  if (channelUrlMatch?.[1]) return channelUrlMatch[1];

  const externalIdMatch = html.match(/"externalId":"(UC[^"]+)"/);
  if (externalIdMatch?.[1]) return externalIdMatch[1];

  const browseIdMatch = html.match(/"browseId":"(UC[^"]+)"/);
  if (browseIdMatch?.[1]) return browseIdMatch[1];

  const metaItempropMatch = html.match(
    /<meta itemprop="channelId" content="(UC[^"]+)">/,
  );
  if (metaItempropMatch?.[1]) return metaItempropMatch[1];

  return null;
}

function extractChannelIdFromInitData(
  initdata: YOUTUBE_HANDLE_PAGE_INIT_DATA,
): string | null {
  const fromMetadata = initdata.metadata?.channelMetadataRenderer?.externalId;
  if (fromMetadata && YOUTUBE_CHANNEL_ID_PATTERN.test(fromMetadata)) {
    return fromMetadata;
  }

  const fromHeader = initdata.header?.c4TabbedHeaderRenderer?.channelId;
  if (fromHeader && YOUTUBE_CHANNEL_ID_PATTERN.test(fromHeader)) {
    return fromHeader;
  }

  const canonicalUrl =
    initdata.microformat?.microformatDataRenderer?.urlCanonical;
  if (canonicalUrl) {
    const match = canonicalUrl.match(/\/channel\/(UC[^/?]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
}

/**
 * Extract the channel title from the handle page's ytInitialData. Tries the
 * newer `pageHeaderViewModel.title.dynamicTextViewModel.text.content`, the
 * legacy `c4TabbedHeaderRenderer.title`, the `pageHeaderRenderer.pageTitle`,
 * and the microformat title in order.
 */
function extractTitleFromInitData(
  initdata: YOUTUBE_HANDLE_PAGE_INIT_DATA,
): string | null {
  const fromDynamic =
    initdata.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.title
      ?.dynamicTextViewModel?.text?.content;
  if (fromDynamic?.trim()) return fromDynamic.trim();

  const fromC4 = initdata.header?.c4TabbedHeaderRenderer?.title;
  if (fromC4?.trim()) return fromC4.trim();

  const fromPageTitle = initdata.header?.pageHeaderRenderer?.pageTitle;
  if (fromPageTitle?.trim()) return fromPageTitle.trim();

  const fromMicroformat = initdata.microformat?.microformatDataRenderer?.title;
  if (fromMicroformat?.trim()) return fromMicroformat.trim();

  const fromMetadata = initdata.metadata?.channelMetadataRenderer?.title;
  if (fromMetadata?.trim()) return fromMetadata.trim();

  return null;
}

/**
 * Extract the subscriber-count text from the handle page's ytInitialData. The
 * newer `pageHeaderViewModel` exposes it as the first metadata part of the
 * second metadata row (`"@handle • 11.8M subscribers"`); the legacy
 * `c4TabbedHeaderRenderer` exposes it as `subscriberCountText.simpleText`.
 */
function extractSubscriberCountTextFromInitData(
  initdata: YOUTUBE_HANDLE_PAGE_INIT_DATA,
): string | null {
  const headerRows =
    initdata.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.metadata
      ?.contentMetadataViewModel?.metadataRows ?? [];
  const fromRow = headerRows[1]?.metadataParts?.[0]?.text?.content;
  if (fromRow?.trim()) return fromRow.trim();

  const fromC4 =
    initdata.header?.c4TabbedHeaderRenderer?.subscriberCountText?.simpleText;
  if (fromC4?.trim()) return fromC4.trim();

  return null;
}

export async function resolveYoutubeHandleToChannelId(
  handle: string,
  geo: Partial<YOUTUBE_GEO_REQUEST> = {},
): Promise<string> {
  const normalizedHandle = normalizeYoutubeHandle(handle);
  const session = await createYoutubeFetchSession(geo);

  try {
    const response = await session.get(
      YOUTUBE_HANDLE_PAGE_URL(normalizedHandle),
    );

    if (!response.ok) {
      throw new Error(`YouTube handle page request failed: ${response.status}`);
    }

    const html = await response.text();
    let channelId = extractChannelIdFromHtml(html);

    if (!channelId) {
      try {
        const initdata =
          extractYtInitialDataFromHtml<YOUTUBE_HANDLE_PAGE_INIT_DATA>(html);
        channelId = extractChannelIdFromInitData(initdata);
      } catch {
        // fall through to not-found error below
      }
    }

    if (!channelId || !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)) {
      throw new Error(
        `Could not resolve channel ID for handle @${normalizedHandle}`,
      );
    }

    return channelId;
  } finally {
    await closeUrlFetchSession(session);
  }
}

export async function fetchYoutubeHandle(
  request: YOUTUBE_HANDLE_REQUEST,
): Promise<YOUTUBE_HANDLE_RESPONSE> {
  const { handle, country, region } = request;
  const normalizedHandle = normalizeYoutubeHandle(handle);
  const session = await createYoutubeFetchSession({ country, region });

  try {
    const response = await session.get(
      YOUTUBE_HANDLE_PAGE_URL(normalizedHandle),
    );

    if (!response.ok) {
      throw new Error(`YouTube handle page request failed: ${response.status}`);
    }

    const html = await response.text();
    let channelId = extractChannelIdFromHtml(html);
    let title: string | null = null;
    let subscriberCountText: string | null = null;

    try {
      const initdata =
        extractYtInitialDataFromHtml<YOUTUBE_HANDLE_PAGE_INIT_DATA>(html);
      if (!channelId) {
        channelId = extractChannelIdFromInitData(initdata);
      }
      title = extractTitleFromInitData(initdata);
      subscriberCountText = extractSubscriberCountTextFromInitData(initdata);
    } catch {
      // ytInitialData parse failure is non-fatal; channelId may still resolve
      // from the HTML regexes above.
    }

    if (!channelId || !YOUTUBE_CHANNEL_ID_PATTERN.test(channelId)) {
      throw new Error(
        `Could not resolve channel ID for handle @${normalizedHandle}`,
      );
    }

    return {
      handle,
      channelId,
      title: emptyToNull(title ?? undefined),
      subscribers: subscriberCountText
        ? abbreviatedCountTextToNumber(subscriberCountText)
        : null,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}
