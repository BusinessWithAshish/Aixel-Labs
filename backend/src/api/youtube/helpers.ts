import { YOUTUBE_SCRAPE_HEADERS } from "./constants";
import type { YT_INIT_DATA, YT_PLAYER_DETAIL, YT_SEARCH_ITEM } from "./types";

export class YoutubeDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoutubeDataError";
  }
}

/**
 * Fetches a YouTube page and extracts `ytInitialData`, the innertube API
 * token, and the INNERTUBE_CONTEXT needed for pagination calls.
 */
export async function getYoutubeInitData(url: string): Promise<YT_INIT_DATA> {
  const response = await fetch(url, { headers: YOUTUBE_SCRAPE_HEADERS });

  if (!response.ok) {
    throw new YoutubeDataError(
      `YouTube page request failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  const initDataMatch = html.match(/var ytInitialData = ({.+?});/);
  if (!initDataMatch) {
    throw new YoutubeDataError("Cannot extract ytInitialData from YouTube page");
  }

  let initdata: Record<string, unknown>;
  try {
    initdata = JSON.parse(initDataMatch[1]);
  } catch {
    throw new YoutubeDataError("Failed to parse ytInitialData JSON");
  }

  const apiTokenMatch = html.match(/"innertubeApiKey":"([^"]+)"/);
  const apiToken = apiTokenMatch ? apiTokenMatch[1] : null;

  const contextMatch = html.match(
    /"INNERTUBE_CONTEXT":({.+?}),"INNERTUBE_CONTEXT_CLIENT_NAME"/,
  );
  let context: unknown = null;
  if (contextMatch) {
    try {
      context = JSON.parse(contextMatch[1]);
    } catch {
      // context is optional; continue without it
    }
  }

  return { initdata, apiToken, context };
}

/**
 * Fetches a YouTube watch page and extracts player-level details:
 * author, channelId, description, keywords, and thumbnail.
 */
export async function getYoutubePlayerDetail(
  url: string,
): Promise<YT_PLAYER_DETAIL> {
  const response = await fetch(url, { headers: YOUTUBE_SCRAPE_HEADERS });

  if (!response.ok) {
    throw new YoutubeDataError(
      `YouTube player page request failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  const videoIdMatch = url.match(/[?&]v=([^&]+)/);
  const fallbackVideoId = videoIdMatch ? videoIdMatch[1] : "";

  const patterns = [
    /var ytInitialPlayerResponse = ({.+?});/,
    /"ytInitialPlayerResponse":\s*({.+?}),/,
    /ytInitialPlayerResponse\s*=\s*({.+?});/,
    /window\["ytInitialPlayerResponse"\]\s*=\s*({.+?});/,
  ];

  let playerData: Record<string, unknown> | null = null;
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        playerData = JSON.parse(match[1]);
        break;
      } catch {
        continue;
      }
    }
  }

  if (!playerData) {
    throw new YoutubeDataError("Cannot extract ytInitialPlayerResponse");
  }

  const videoDetails = (playerData.videoDetails ?? {}) as Record<
    string,
    unknown
  >;

  return {
    videoId: (videoDetails.videoId as string | undefined) ?? fallbackVideoId,
    thumbnail:
      (
        videoDetails.thumbnail as
          | { thumbnails?: { url: string; width?: number; height?: number }[] }
          | undefined
      )?.thumbnails ?? null,
    author: (videoDetails.author as string | undefined) ?? null,
    channelId: (videoDetails.channelId as string | undefined) ?? "",
    shortDescription:
      (videoDetails.shortDescription as string | undefined) ?? "",
    keywords: (videoDetails.keywords as string[] | undefined) ?? [],
  };
}

/** Extracts text from a YouTube runs/simpleText title object. */
function extractText(
  data: unknown,
): string {
  if (!data || typeof data !== "object") return "";
  const obj = data as Record<string, unknown>;

  if (Array.isArray(obj.runs) && obj.runs.length > 0) {
    return (obj.runs as Array<{ text?: string }>)
      .map((r) => r?.text ?? "")
      .join("");
  }
  if (typeof obj.simpleText === "string") return obj.simpleText;
  return "";
}

function normalizeThumbnails(
  thumb: unknown,
): { url: string; width?: number; height?: number }[] | null {
  if (!thumb || typeof thumb !== "object") return null;
  const t = thumb as Record<string, unknown>;

  if (Array.isArray(t.thumbnails)) return t.thumbnails as { url: string; width?: number; height?: number }[];
  if (Array.isArray(thumb)) return thumb as { url: string; width?: number; height?: number }[];
  return null;
}

/**
 * Converts a `videoRenderer` or `playlistVideoRenderer` object into a
 * normalised `YT_SEARCH_ITEM`.
 */
export function renderVideoItem(
  itemData: Record<string, unknown>,
): YT_SEARCH_ITEM {
  const renderer = (itemData.videoRenderer ??
    itemData.playlistVideoRenderer) as Record<string, unknown> | undefined;

  if (!renderer) {
    return {
      id: "",
      type: "",
      title: "",
      thumbnail: null,
      channelTitle: null,
      shortBylineText: null,
      length: null,
      isLive: false,
      videoCount: null,
    };
  }

  // Detect live badge
  let isLive = false;
  const badges = renderer.badges as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(badges)) {
    for (const badge of badges) {
      const meta = badge?.metadataBadgeRenderer as
        | Record<string, unknown>
        | undefined;
      if (meta?.style === "BADGE_STYLE_TYPE_LIVE_NOW") {
        isLive = true;
        break;
      }
    }
  }
  if (!isLive) {
    const overlays = renderer.thumbnailOverlays as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(overlays)) {
      for (const overlay of overlays) {
        const timeStatus = overlay?.thumbnailOverlayTimeStatusRenderer as
          | Record<string, unknown>
          | undefined;
        if (timeStatus?.style === "LIVE") {
          isLive = true;
          break;
        }
      }
    }
  }

  const channelTitle =
    extractText(
      (renderer.ownerText as Record<string, unknown> | undefined) ?? {},
    ) || null;

  const shortBylineText =
    extractText(
      (renderer.shortBylineText as Record<string, unknown> | undefined) ?? {},
    ) || null;

  const lengthData = renderer.lengthText;
  const length = lengthData ? extractText(lengthData) || String(lengthData) : null;

  return {
    id: String(renderer.videoId ?? ""),
    type: "video",
    title: extractText(renderer.title),
    thumbnail: normalizeThumbnails(renderer.thumbnail),
    channelTitle,
    shortBylineText,
    length,
    isLive,
    videoCount: null,
  };
}

/**
 * Converts a `compactVideoRenderer` object (used in suggestions sidebar)
 * into a normalised `YT_SEARCH_ITEM`.
 */
export function renderCompactVideo(
  itemData: Record<string, unknown>,
): YT_SEARCH_ITEM {
  const renderer = (itemData.compactVideoRenderer ?? {}) as Record<
    string,
    unknown
  >;

  let isLive = false;
  const badges = renderer.badges as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(badges)) {
    for (const badge of badges) {
      const meta = badge?.metadataBadgeRenderer as
        | Record<string, unknown>
        | undefined;
      if (meta?.style === "BADGE_STYLE_TYPE_LIVE_NOW") {
        isLive = true;
        break;
      }
    }
  }

  const title = extractText(renderer.title);
  const shortByline = (renderer.shortBylineText ?? {}) as Record<
    string,
    unknown
  >;
  const channelTitle =
    Array.isArray(shortByline.runs) && shortByline.runs.length > 0
      ? String(
          (shortByline.runs as Array<{ text?: string }>)[0]?.text ?? "",
        )
      : null;

  const thumbObj = renderer.thumbnail as Record<string, unknown> | undefined;

  return {
    id: String(renderer.videoId ?? ""),
    type: "video",
    title,
    thumbnail: thumbObj ? normalizeThumbnails(thumbObj) : null,
    channelTitle,
    shortBylineText: channelTitle,
    length: renderer.lengthText
      ? extractText(renderer.lengthText) || null
      : null,
    isLive,
    videoCount: null,
  };
}
