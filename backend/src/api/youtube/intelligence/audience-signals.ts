import { formatSecondsAsTimestamp } from "../../../utils/timestamp";
import type { YOUTUBE_COMMENT_TIMESTAMP_CLUSTER } from "./comments/types";
import type { YOUTUBE_VIDEO_CHAPTERS_RESPONSE } from "../video/types";

/**
 * Audience-signal formatters — the YouTube side of the viral-clipper's
 * `audienceSignals` input. They turn this module's own scrape output
 * (comments-intelligence timestamp clusters, creator chapters) into the
 * prompt-ready lines `/viral-moments` consumes, so callers fetch via the
 * `youtube` tool/routes and format here instead of the clipper wrapping
 * the same scrape a second time.
 */

/** Formats comment-timestamp clusters into prompt-ready audience-signal lines. */
export function formatCommentTimestampClustersAsAudienceSignals(
  clusters: YOUTUBE_COMMENT_TIMESTAMP_CLUSTER[],
): string[] {
  return clusters.map(
    (c) =>
      `${formatSecondsAsTimestamp(c.timestampSeconds)} — ${c.mentionCount} viewer${c.mentionCount === 1 ? "" : "s"} mentioned this, ${c.totalLikes} likes total (e.g. "${c.sampleTexts[0]}")`,
  );
}

/** Formats creator chapter markers into prompt-ready audience-signal lines. */
export function formatChaptersAsAudienceSignals(
  chapters: YOUTUBE_VIDEO_CHAPTERS_RESPONSE["chapters"],
): string[] {
  return chapters.map(
    (c) => `${formatSecondsAsTimestamp(c.startSeconds)} — chapter: "${c.title}"`,
  );
}
