import { VIRAL_CLIPPER_YOUTUBE } from "./constants";
import type { VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE, TIMESTAMP_MENTION_CLUSTER } from "./types";
import { fetchYoutubeMetadata, formatSecondsAsTimestamp } from "./youtube-metadata";

/**
 * Matches "MM:SS" or "H:MM:SS" inside free-text comment bodies — the common
 * pattern viewers use to call out a specific moment (e.g. "12:34 lol",
 * "the part at 15:20 killed me"). Not perfect (a stray ratio-looking string
 * could false-positive) but noise gets naturally outweighed by real
 * clusters during aggregation below, so no need for a stricter parser.
 */
const TIMESTAMP_PATTERN = /\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b/g;

function extractTimestampSecondsFromText(text: string): number[] {
  const matches: number[] = [];
  for (const m of text.matchAll(TIMESTAMP_PATTERN)) {
    const h = m[1] ? Number(m[1]) : 0;
    const min = Number(m[2]);
    const sec = Number(m[3]);
    matches.push(h * 3600 + min * 60 + sec);
  }
  return matches;
}

type TimestampMention = {
  timestampSeconds: number;
  text: string;
  likeCount: number;
};

/**
 * Greedy single-pass clustering: sort mentions by timestamp, merge into the
 * previous cluster when within `windowSeconds`, else start a new one. Not a
 * proper clustering algorithm (a dense run of points can chain into one
 * cluster wider than the window) — deliberately simple since this is a
 * fuzzy popularity heuristic, not a scored signal that needs to be exact.
 */
function clusterTimestampMentions(
  mentions: TimestampMention[],
  windowSeconds: number,
): TIMESTAMP_MENTION_CLUSTER[] {
  const sorted = [...mentions].sort((a, b) => a.timestampSeconds - b.timestampSeconds);
  const clusters: TIMESTAMP_MENTION_CLUSTER[] = [];

  for (const mention of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && mention.timestampSeconds - last.timestampSeconds <= windowSeconds) {
      last.mentionCount += 1;
      last.totalLikes += mention.likeCount;
      if (last.sampleComments.length < 3) last.sampleComments.push(mention.text);
    } else {
      clusters.push({
        timestampSeconds: mention.timestampSeconds,
        mentionCount: 1,
        totalLikes: mention.likeCount,
        sampleComments: [mention.text],
      });
    }
  }

  return clusters.sort(
    (a, b) => b.mentionCount * 10 + b.totalLikes - (a.mentionCount * 10 + a.totalLikes),
  );
}

/**
 * Fetches top comments on a YouTube video and extracts "audience-flagged"
 * moments — timestamps viewers themselves called out, ranked by how many
 * independent commenters pointed at roughly the same moment plus total
 * likes on those comments. Pure signal-extraction, no LLM call.
 */
export async function fetchYoutubeCommentHighlights(
  videoUrl: string,
  maxComments: number = VIRAL_CLIPPER_YOUTUBE.DEFAULT_MAX_COMMENTS,
): Promise<VIRAL_CLIPPER_YOUTUBE_COMMENTS_RESPONSE> {
  const meta = await fetchYoutubeMetadata(videoUrl, { withComments: true, maxComments });
  const comments = meta.comments ?? [];

  const mentions: TimestampMention[] = [];
  for (const c of comments) {
    for (const timestampSeconds of extractTimestampSecondsFromText(c.text)) {
      mentions.push({ timestampSeconds, text: c.text.slice(0, 200), likeCount: c.like_count ?? 0 });
    }
  }

  const clusters = clusterTimestampMentions(
    mentions,
    VIRAL_CLIPPER_YOUTUBE.TIMESTAMP_CLUSTER_WINDOW_SECONDS,
  ).slice(0, VIRAL_CLIPPER_YOUTUBE.MAX_TIMESTAMP_CLUSTERS_RETURNED);

  return {
    videoTitle: meta.title,
    commentsScanned: comments.length,
    highlights: clusters,
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
