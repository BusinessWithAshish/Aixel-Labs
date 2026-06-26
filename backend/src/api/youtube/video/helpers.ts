import { YOUTUBE_BASE_URL } from "../constants";
import {
  YoutubeDataError,
  getYoutubeInitData,
  getYoutubePlayerDetail,
  renderCompactVideo,
} from "../helpers";
import type { YOUTUBE_VIDEO_DETAILS_RESPONSE } from "./types";
import type { YT_SEARCH_ITEM } from "../types";

export async function fetchYoutubeVideoDetails(
  videoId: string,
): Promise<YOUTUBE_VIDEO_DETAILS_RESPONSE> {
  const url = `${YOUTUBE_BASE_URL}/watch?v=${videoId}`;

  const [pageData, playerData] = await Promise.all([
    getYoutubeInitData(url),
    getYoutubePlayerDetail(url),
  ]);

  const contents = (
    pageData.initdata.contents as Record<string, unknown> | undefined
  ) ?? {};
  const twoColumn = (
    contents.twoColumnWatchNextResults as Record<string, unknown> | undefined
  ) ?? {};
  const results = (
    (twoColumn.results as Record<string, unknown> | undefined)?.results as
      | Record<string, unknown>
      | undefined
  ) ?? {};
  const resultContents = (results.contents as unknown[]) ?? [];

  let title = "";
  let isLive = false;
  let channel = "";

  if (resultContents.length > 0) {
    const primaryInfo = (
      (resultContents[0] as Record<string, unknown>)
        .videoPrimaryInfoRenderer as Record<string, unknown> | undefined
    ) ?? {};

    const titleData = primaryInfo.title as Record<string, unknown> | undefined;
    if (Array.isArray(titleData?.runs) && titleData!.runs.length > 0) {
      title = String(
        (titleData!.runs as Array<{ text?: string }>)[0]?.text ?? "",
      );
    }

    const viewCount = (
      primaryInfo.viewCount as Record<string, unknown> | undefined
    ) ?? {};
    const videoViewCount = (
      viewCount.videoViewCountRenderer as Record<string, unknown> | undefined
    ) ?? {};
    isLive = Boolean(videoViewCount.isLive ?? false);
  }

  if (resultContents.length > 1) {
    const secondaryInfo = (
      (resultContents[1] as Record<string, unknown>)
        .videoSecondaryInfoRenderer as Record<string, unknown> | undefined
    ) ?? {};
    const owner = (
      (secondaryInfo.owner as Record<string, unknown> | undefined)
        ?.videoOwnerRenderer as Record<string, unknown> | undefined
    ) ?? {};
    const ownerTitle = owner.title as Record<string, unknown> | undefined;
    if (Array.isArray(ownerTitle?.runs) && ownerTitle!.runs.length > 0) {
      channel = String(
        (ownerTitle!.runs as Array<{ text?: string }>)[0]?.text ?? "",
      );
    }
  }

  // Collect suggested videos from the sidebar
  const suggestions: YT_SEARCH_ITEM[] = [];
  const secondaryResults = (
    (twoColumn.secondaryResults as Record<string, unknown> | undefined)
      ?.secondaryResults as Record<string, unknown> | undefined
  ) ?? {};
  const suggestionResults = (secondaryResults.results as unknown[]) ?? [];

  for (const suggestion of suggestionResults) {
    const s = suggestion as Record<string, unknown>;
    if (s.compactVideoRenderer) {
      suggestions.push(renderCompactVideo(s));
    }
  }

  return {
    id: playerData.videoId,
    title: title || "",
    thumbnail: playerData.thumbnail,
    isLive,
    channel: playerData.author ?? channel,
    channelId: playerData.channelId,
    description: playerData.shortDescription,
    keywords: playerData.keywords,
    suggestions,
  };
}

export { YoutubeDataError };
