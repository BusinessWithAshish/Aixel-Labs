export type YT_THUMBNAIL = {
  url: string;
  width?: number;
  height?: number;
};

export type YT_SEARCH_ITEM = {
  id: string;
  type: "video" | "channel" | "playlist" | "reel" | string;
  title: string;
  thumbnail: YT_THUMBNAIL[] | null;
  channelTitle: string | null;
  shortBylineText: string | null;
  length: string | null;
  isLive: boolean;
  videoCount: string | null;
};

export type YT_NEXT_PAGE = {
  nextPageToken: string | null;
  nextPageContext: {
    context: unknown;
    continuation: string | null;
  } | null;
};

/** Internal — parsed from the YouTube HTML page */
export type YT_INIT_DATA = {
  initdata: Record<string, unknown>;
  apiToken: string | null;
  context: unknown | null;
};

/** Internal — parsed from ytInitialPlayerResponse */
export type YT_PLAYER_DETAIL = {
  videoId: string;
  thumbnail: YT_THUMBNAIL[] | null;
  author: string | null;
  channelId: string;
  shortDescription: string;
  keywords: string[];
};
