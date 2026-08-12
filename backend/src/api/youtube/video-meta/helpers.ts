import {
  YOUTUBE_HANDLER_LABELS,
  YOUTUBE_VIDEO_META_CONCURRENCY,
  YOUTUBE_VIDEO_META_MAX_BATCH,
  YOUTUBE_VIDEO_URL,
} from "../constants";
import { runWithConcurrency } from "../concurrency";
import {
  abbreviatedCountTextToNumber,
  createYoutubeFetchSession,
  fetchYoutubeWatchPageContext,
  resolveYoutubeGeo,
} from "../helpers";
import { withSharedClientVersion } from "../client-version-cache";
import type { YOUTUBE_VIDEO_WATCH_META } from "../types";
import {
  closeUrlFetchSession,
  type UrlFetchSession,
} from "../../../utils/node-tls-client-session-handler";
import {
  extractChannelSubscriberCountText,
  extractCommentCountFromGetWatch,
  extractDescriptionFromGetWatch,
  extractLengthSecondsFromGetWatch,
  extractLikeCountFromGetWatch,
  extractPublishedAtFromGetWatch,
  fetchGetWatch,
} from "../video/helpers";
import type {
  YOUTUBE_VIDEO_META_ITEM,
  YOUTUBE_VIDEO_META_REQUEST,
  YOUTUBE_VIDEO_META_RESPONSE,
} from "./types";

type VideoMetaGeo = Pick<YOUTUBE_VIDEO_META_REQUEST, "country" | "region">;

async function fetchVideoMetaForVideo(
  videoId: string,
  gl: string,
  geo: VideoMetaGeo,
  deepCommentLookup: boolean,
): Promise<YOUTUBE_VIDEO_META_ITEM> {
  let session: UrlFetchSession | null = null;

  try {
    session = await createYoutubeFetchSession(geo);
    const activeSession = session;

    // withSharedClientVersion self-heals a mid-TTL client-version rotation
    // (invalidate + one fresh retry) instead of failing the whole video.
    const { result: data } = await withSharedClientVersion(
      () => createYoutubeFetchSession(geo),
      (clientVersion) => fetchGetWatch(activeSession, clientVersion, gl, videoId),
    );

    const channelSubscriberCountText = extractChannelSubscriberCountText(data);

    let commentCount = extractCommentCountFromGetWatch(data);
    // When get_watch is UNPLAYABLE it often omits the comments engagement
    // panel; the real count lives on watch-page ytInitialData — but fetching
    // that is a full HTML page (several hundred KB) per video, so it's opt-in
    // via `deepCommentLookup` rather than automatic for every bulk-enrich call.
    if (commentCount === null && deepCommentLookup) {
      try {
        const { initialData } = await fetchYoutubeWatchPageContext(
          session,
          YOUTUBE_VIDEO_URL(videoId),
        );
        commentCount = extractCommentCountFromGetWatch(data, initialData);
      } catch (err) {
        console.warn(
          `[${YOUTUBE_HANDLER_LABELS.VIDEO_META}] Comment fallback failed:`,
          videoId,
          err,
        );
      }
    }

    return {
      videoId,
      publishedAt: extractPublishedAtFromGetWatch(data),
      lengthSeconds: extractLengthSecondsFromGetWatch(data),
      channelSubscribers: abbreviatedCountTextToNumber(
        channelSubscriberCountText,
      ),
      likeCount: extractLikeCountFromGetWatch(data),
      commentCount,
      description: extractDescriptionFromGetWatch(data),
    };
  } catch (err) {
    console.warn(
      `[${YOUTUBE_HANDLER_LABELS.VIDEO_META}] Failed to resolve video:`,
      videoId,
      err,
    );
    return {
      videoId,
      publishedAt: null,
      lengthSeconds: null,
      channelSubscribers: null,
      likeCount: null,
      commentCount: null,
      description: null,
    };
  } finally {
    await closeUrlFetchSession(session);
  }
}

/**
 * Batch-resolve absolute publish dates for many videos in parallel.
 *
 * `INNERTUBE_CLIENT_VERSION` comes from the shared process-wide cache
 * (`client-version-cache.ts`) — no page fetch in the common case, since the
 * same build id serves every video/channel/country. Concurrent `get_watch`
 * POSTs each run on their own TLS session (`node-tls-client` sessions are
 * not shared across parallel requests).
 */
export async function fetchYoutubeVideoMeta(
  request: YOUTUBE_VIDEO_META_REQUEST,
): Promise<YOUTUBE_VIDEO_META_RESPONSE> {
  const { country, region, videoIds, deepCommentLookup = false } = request;
  const geo = { country, region };
  const { gl } = resolveYoutubeGeo(geo);

  const uniqueVideoIds = [...new Set(videoIds.map((id) => id.trim()))].filter(
    Boolean,
  );

  if (uniqueVideoIds.length === 0) {
    return { items: [], requested: 0, resolved: 0 };
  }

  const items = await runWithConcurrency(
    uniqueVideoIds,
    YOUTUBE_VIDEO_META_CONCURRENCY,
    (videoId) => fetchVideoMetaForVideo(videoId, gl, geo, deepCommentLookup),
  );

  const resolved = items.filter((item) => item.publishedAt !== null).length;

  return {
    items,
    requested: uniqueVideoIds.length,
    resolved,
  };
}

/** Map helper for intelligence enrichers. */
export function videoMetaItemsToPublishedAtMap(
  items: YOUTUBE_VIDEO_META_ITEM[],
): Map<string, string | null> {
  return new Map(items.map((item) => [item.videoId, item.publishedAt]));
}

export function videoMetaItemsToWatchMetaMap(
  items: YOUTUBE_VIDEO_META_ITEM[],
): Map<string, YOUTUBE_VIDEO_WATCH_META> {
  return new Map(
    items.map((item) => [
      item.videoId,
      {
        publishedAt: item.publishedAt,
        lengthSeconds: item.lengthSeconds,
        channelSubscribers: item.channelSubscribers,
        likeCount: item.likeCount,
        commentCount: item.commentCount,
        description: item.description,
      },
    ]),
  );
}

/** Batch-fetch absolute publish dates and return a videoId → publishedAt map. */
export async function fetchPublishedAtByVideoIds(
  videoIds: string[],
  geo: VideoMetaGeo,
): Promise<Map<string, string | null>> {
  const watchMetaByVideoId = await fetchVideoWatchMetaByVideoIds(videoIds, geo);
  return new Map(
    [...watchMetaByVideoId.entries()].map(([videoId, watchMeta]) => [
      videoId,
      watchMeta.publishedAt,
    ]),
  );
}

/**
 * Batch-fetch publish dates and durations from `get_watch`.
 *
 * `deepCommentLookup` (default `false`) opts into per-video full watch-page
 * fallback fetches for videos where `get_watch` omits a comment count —
 * expensive in Evomi bandwidth, so callers that don't need exact comment
 * counts (most enrichment call sites) should leave it off.
 */
export async function fetchVideoWatchMetaByVideoIds(
  videoIds: string[],
  geo: VideoMetaGeo,
  deepCommentLookup = false,
): Promise<Map<string, YOUTUBE_VIDEO_WATCH_META>> {
  const uniqueVideoIds = [...new Set(videoIds)];
  const watchMetaByVideoId = new Map<string, YOUTUBE_VIDEO_WATCH_META>();

  for (
    let i = 0;
    i < uniqueVideoIds.length;
    i += YOUTUBE_VIDEO_META_MAX_BATCH
  ) {
    const batch = uniqueVideoIds.slice(i, i + YOUTUBE_VIDEO_META_MAX_BATCH);
    const meta = await fetchYoutubeVideoMeta({
      ...geo,
      videoIds: batch,
      deepCommentLookup,
    });
    for (const [videoId, watchMeta] of videoMetaItemsToWatchMetaMap(
      meta.items,
    )) {
      watchMetaByVideoId.set(videoId, watchMeta);
    }
  }

  return watchMetaByVideoId;
}
