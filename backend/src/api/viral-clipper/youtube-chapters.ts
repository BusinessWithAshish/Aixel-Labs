import { YOUTUBE_DEFAULT_COUNTRY } from "../youtube/constants";
import { parseYoutubeVideoId } from "../youtube/helpers";
import { fetchYoutubeVideoChapters } from "../youtube/video/helpers";
import { VIRAL_CLIPPER_ERROR_MESSAGES } from "./constants";
import { formatSecondsAsTimestamp } from "./format-timestamp";
import type { VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE } from "./types";

/** Fetches creator-authored chapter markers via InnerTube get_watch. Empty chapters is valid. */
export async function fetchYoutubeChapters(
  videoUrl: string,
): Promise<VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE> {
  const videoId = parseYoutubeVideoId(videoUrl);
  if (!videoId) {
    throw new Error(
      `${VIRAL_CLIPPER_ERROR_MESSAGES.YOUTUBE_METADATA_FETCH_FAILED}: invalid YouTube URL`,
    );
  }

  const result = await fetchYoutubeVideoChapters({
    videoId,
    country: YOUTUBE_DEFAULT_COUNTRY,
  });
  return {
    videoTitle: result.videoTitle ?? videoId,
    chapters: result.chapters,
  };
}

/** Formats chapters into prompt-ready lines for `scoreViralMoments`' `audienceSignals`. */
export function formatChaptersAsAudienceSignals(
  chapters: VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE["chapters"],
): string[] {
  return chapters.map(
    (c) => `${formatSecondsAsTimestamp(c.startSeconds)} — chapter: "${c.title}"`,
  );
}
