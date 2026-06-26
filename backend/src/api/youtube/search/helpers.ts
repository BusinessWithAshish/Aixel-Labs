import { YOUTUBE_BASE_URL, YOUTUBE_SEARCH_FILTER_SP } from "../constants";
import {
  YoutubeDataError,
  getYoutubeInitData,
  renderVideoItem,
} from "../helpers";
import type { YOUTUBE_SEARCH_REQUEST, YOUTUBE_SEARCH_RESPONSE } from "./types";
import type { YT_SEARCH_ITEM } from "../types";

export async function fetchYoutubeSearch(
  params: YOUTUBE_SEARCH_REQUEST,
): Promise<YOUTUBE_SEARCH_RESPONSE> {
  const { query, filter, limit, withPlaylist } = params;

  let endpoint = `${YOUTUBE_BASE_URL}/results?search_query=${encodeURIComponent(query)}`;

  if (filter && YOUTUBE_SEARCH_FILTER_SP[filter]) {
    endpoint += `&sp=${YOUTUBE_SEARCH_FILTER_SP[filter]}`;
  }

  const pageData = await getYoutubeInitData(endpoint);

  const contents = (
    pageData.initdata.contents as Record<string, unknown> | undefined
  ) ?? {};
  const twoColumn = (
    contents.twoColumnSearchResultsRenderer as
      | Record<string, unknown>
      | undefined
  ) ?? {};
  const primaryContents = (
    twoColumn.primaryContents as Record<string, unknown> | undefined
  ) ?? {};
  const sectionList = (
    primaryContents.sectionListRenderer as Record<string, unknown> | undefined
  ) ?? {};
  const sectionContents = (sectionList.contents as unknown[]) ?? [];

  const items: YT_SEARCH_ITEM[] = [];
  let continuationToken: string | null = null;

  for (const content of sectionContents) {
    const c = content as Record<string, unknown>;

    if (c.continuationItemRenderer) {
      const continuationData = c.continuationItemRenderer as Record<
        string,
        unknown
      >;
      const endpoint_ = (
        continuationData.continuationEndpoint as
          | Record<string, unknown>
          | undefined
      ) ?? {};
      const command = (
        endpoint_.continuationCommand as Record<string, unknown> | undefined
      ) ?? {};
      continuationToken = (command.token as string | undefined) ?? null;
    } else if (c.itemSectionRenderer) {
      const itemSection = c.itemSectionRenderer as Record<string, unknown>;
      const sectionItems = (itemSection.contents as unknown[]) ?? [];

      for (const item of sectionItems) {
        const i = item as Record<string, unknown>;

        if (i.channelRenderer) {
          const cr = i.channelRenderer as Record<string, unknown>;
          const thumbObj = cr.thumbnail as Record<string, unknown> | undefined;
          const thumbnails = Array.isArray(thumbObj?.thumbnails)
            ? (thumbObj!.thumbnails as {
                url: string;
                width?: number;
                height?: number;
              }[])
            : null;
          items.push({
            id: String(cr.channelId ?? ""),
            type: "channel",
            title:
              (
                (cr.title as Record<string, unknown> | undefined)
                  ?.simpleText as string | undefined
              ) ?? "",
            thumbnail: thumbnails,
            channelTitle: null,
            shortBylineText: null,
            length: null,
            isLive: false,
            videoCount: null,
          });
        } else if (i.videoRenderer) {
          items.push(renderVideoItem(i));
        } else if (withPlaylist && i.playlistRenderer) {
          const pr = i.playlistRenderer as Record<string, unknown>;
          const thumbArr = Array.isArray(pr.thumbnails)
            ? (pr.thumbnails as {
                url: string;
                width?: number;
                height?: number;
              }[])
            : null;
          items.push({
            id: String(pr.playlistId ?? ""),
            type: "playlist",
            title:
              (
                (pr.title as Record<string, unknown> | undefined)
                  ?.simpleText as string | undefined
              ) ?? "",
            thumbnail: thumbArr,
            channelTitle: null,
            shortBylineText: null,
            length: String(pr.videoCount ?? ""),
            isLive: false,
            videoCount: String(pr.videoCount ?? ""),
          });
        }
      }
    }
  }

  const limitedItems = limit && limit > 0 ? items.slice(0, limit) : items;

  return {
    items: limitedItems,
    nextPage: {
      nextPageToken: pageData.apiToken,
      nextPageContext: {
        context: pageData.context,
        continuation: continuationToken,
      },
    },
  };
}

export { YoutubeDataError };
