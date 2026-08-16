import { fetchYoutubeMetadata, formatSecondsAsTimestamp } from "./youtube-metadata";
import type { VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE } from "./types";

/** Fetches a YouTube video's creator-authored chapter markers, if it has any. */
export async function fetchYoutubeChapters(
  videoUrl: string,
): Promise<VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE> {
  const meta = await fetchYoutubeMetadata(videoUrl, { withComments: false });

  const chapters = (meta.chapters ?? []).map((c) => ({
    title: c.title,
    startSeconds: c.start_time,
    endSeconds: c.end_time,
  }));

  return { videoTitle: meta.title, chapters };
}

/** Formats chapters into prompt-ready lines for `scoreViralMoments`' `audienceSignals`. */
export function formatChaptersAsAudienceSignals(
  chapters: VIRAL_CLIPPER_YOUTUBE_CHAPTERS_RESPONSE["chapters"],
): string[] {
  return chapters.map(
    (c) => `${formatSecondsAsTimestamp(c.startSeconds)} — chapter: "${c.title}"`,
  );
}
