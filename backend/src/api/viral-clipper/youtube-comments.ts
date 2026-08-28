import { YOUTUBE_COMMENTS_MAX_LIMIT, YOUTUBE_COMMENTS_SORT } from "../youtube/comments/constants";
import { YOUTUBE_DEFAULT_COUNTRY } from "../youtube/constants";
import { parseYoutubeVideoId } from "../youtube/helpers";
import { commentsIntelligenceService } from "../youtube/intelligence/comments/service";
import { fetchYoutubeVideoDetails } from "../youtube/video/helpers";
import { VIRAL_CLIPPER_ERROR_MESSAGES, VIRAL_CLIPPER_YOUTUBE } from "./constants";
import { formatSecondsAsTimestamp } from "./format-timestamp";
import type {
  TIMESTAMP_MENTION_CLUSTER,
  VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE,
} from "./types";

/**
 * Fetches top comments via InnerTube and returns audience-flagged moments
 * from comments-intelligence timestamp clusters. No yt-dlp.
 */
export async function fetchYoutubeCommentHighlights(
  videoUrl: string,
  maxComments: number = VIRAL_CLIPPER_YOUTUBE.DEFAULT_MAX_COMMENTS,
): Promise<VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE> {
  const videoId = parseYoutubeVideoId(videoUrl);
  if (!videoId) {
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.YOUTUBE_METADATA_FETCH_FAILED}: invalid YouTube URL`,
    );
  }

  const limit = Math.min(maxComments, YOUTUBE_COMMENTS_MAX_LIMIT);
  const [intel, details] = await Promise.all([
    commentsIntelligenceService({
      videoId,
      country: YOUTUBE_DEFAULT_COUNTRY,
      sort: YOUTUBE_COMMENTS_SORT.TOP,
      limit,
    }),
    fetchYoutubeVideoDetails({ videoId, country: YOUTUBE_DEFAULT_COUNTRY }),
  ]);

  const highlights: TIMESTAMP_MENTION_CLUSTER[] =
    intel.intelligence.timestampClusters.map((cluster) => ({
      timestampSeconds: cluster.timestampSeconds,
      mentionCount: cluster.mentionCount,
      totalLikes: cluster.totalLikes,
      sampleComments: cluster.sampleTexts,
    }));

  return {
    videoTitle: details.title ?? videoId,
    commentsScanned: intel.intelligence.scannedCount,
    highlights,
  };
}

/** Formats comment-timestamp highlights into prompt-ready lines for `scoreViralMoments`' `audienceSignals`. */
export function formatCommentHighlightsAsAudienceSignals(
  highlights: TIMESTAMP_MENTION_CLUSTER[],
): string[] {
  return highlights.map(
    (h) =>
      `${formatSecondsAsTimestamp(h.timestampSeconds)} — ${h.mentionCount} viewer${h.mentionCount === 1 ? "" : "s"} mentioned this, ${h.totalLikes} likes total (e.g. "${h.sampleComments[0]}")`,
  );
}
