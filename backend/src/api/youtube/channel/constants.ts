import { YOUTUBE_BASE_URL } from "../constants";

export enum YT_CHANNEL_CONTENT_TYPE {
  VIDEOS = "videos",
  SHORTS = "shorts",
  PLAYLISTS = "playlists",
}

/**
 * YouTube channel browse tab `params` values (base64-encoded protobuf descriptors).
 */
export const YOUTUBE_CHANNEL_CONTENT_PARAMS: Record<
  YT_CHANNEL_CONTENT_TYPE,
  string
> = {
  [YT_CHANNEL_CONTENT_TYPE.VIDEOS]: "EgZ2aWRlb3PyBgQKAjoA",
  [YT_CHANNEL_CONTENT_TYPE.SHORTS]: "EgZzaG9ydHPyBgUKA5oBAA==",
  [YT_CHANNEL_CONTENT_TYPE.PLAYLISTS]: "EglwbGF5bGlzdHPyBgQKAkIA",
};

export const YOUTUBE_CHANNEL_PLAYLIST_URL = (playlistId: string) =>
  `${YOUTUBE_BASE_URL}/playlist?list=${playlistId}`;
