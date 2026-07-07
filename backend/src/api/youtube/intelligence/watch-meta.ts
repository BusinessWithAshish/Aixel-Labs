import type { YOUTUBE_VIDEO_WATCH_META } from "../video-meta";

export const EMPTY_YOUTUBE_VIDEO_WATCH_META: YOUTUBE_VIDEO_WATCH_META = {
  publishedAt: null,
  lengthSeconds: null,
  channelSubscribers: null,
  likeCount: null,
  commentCount: null,
};

export function resolveWatchMeta(
  watchMetaByVideoId: Map<string, YOUTUBE_VIDEO_WATCH_META>,
  videoId: string | null | undefined,
): YOUTUBE_VIDEO_WATCH_META {
  if (!videoId) return EMPTY_YOUTUBE_VIDEO_WATCH_META;
  return watchMetaByVideoId.get(videoId) ?? EMPTY_YOUTUBE_VIDEO_WATCH_META;
}

export function createEmptyWatchMetaMap(): Map<
  string,
  YOUTUBE_VIDEO_WATCH_META
> {
  return new Map<string, YOUTUBE_VIDEO_WATCH_META>();
}
