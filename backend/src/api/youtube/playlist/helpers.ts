import { YOUTUBE_BASE_URL } from "../constants";
import {
  YoutubeDataError,
  getYoutubeInitData,
  renderVideoItem,
} from "../helpers";
import type { YOUTUBE_PLAYLIST_RESPONSE } from "./types";
import type { YT_SEARCH_ITEM } from "../types";

export async function fetchYoutubePlaylist(
  playlistId: string,
  limit?: number,
): Promise<YOUTUBE_PLAYLIST_RESPONSE> {
  const url = `${YOUTUBE_BASE_URL}/playlist?list=${playlistId}`;

  const initData = await getYoutubeInitData(url);

  const metadata = initData.initdata.metadata ?? null;

  const contents = (
    initData.initdata.contents as Record<string, unknown> | undefined
  ) ?? {};
  const twoColumn = (
    contents.twoColumnBrowseResultsRenderer as
      | Record<string, unknown>
      | undefined
  ) ?? {};
  const tabs = (twoColumn.tabs as unknown[]) ?? [];

  const items: YT_SEARCH_ITEM[] = [];

  if (tabs.length > 0) {
    const firstTab = tabs[0] as Record<string, unknown>;
    const tabContent = (
      (firstTab.tabRenderer as Record<string, unknown> | undefined)
        ?.content as Record<string, unknown> | undefined
    ) ?? {};
    const sectionListRenderer = (
      tabContent.sectionListRenderer as Record<string, unknown> | undefined
    ) ?? {};
    const sectionContents = (
      sectionListRenderer.contents as unknown[] | undefined
    ) ?? [];

    if (sectionContents.length > 0) {
      const itemSection = (
        (sectionContents[0] as Record<string, unknown>)
          .itemSectionRenderer as Record<string, unknown> | undefined
      ) ?? {};
      const playlistContent = (itemSection.contents as unknown[]) ?? [];

      if (playlistContent.length > 0) {
        const playlistRenderer = (
          (playlistContent[0] as Record<string, unknown>)
            .playlistVideoListRenderer as Record<string, unknown> | undefined
        ) ?? {};
        const videoItems = (playlistRenderer.contents as unknown[]) ?? [];

        for (const item of videoItems) {
          const i = item as Record<string, unknown>;
          if (i.playlistVideoRenderer) {
            items.push(renderVideoItem(i));
          }
        }
      }
    }
  }

  const limitedItems = limit && limit > 0 ? items.slice(0, limit) : items;

  return {
    playlistId,
    metadata,
    items: limitedItems,
  };
}

export { YoutubeDataError };
