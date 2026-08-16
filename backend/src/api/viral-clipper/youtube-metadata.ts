import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { VIRAL_CLIPPER_ERROR_MESSAGES, VIRAL_CLIPPER_YOUTUBE } from "./constants";

const execFileAsync = promisify(execFile);

export type YT_DLP_CHAPTER = {
  start_time: number;
  end_time: number;
  title: string;
};

export type YT_DLP_COMMENT = {
  text: string;
  like_count: number;
  timestamp: number;
  author: string;
};

export type YT_DLP_VIDEO_META = {
  id: string;
  title: string;
  duration: number;
  chapters?: YT_DLP_CHAPTER[] | null;
  comments?: YT_DLP_COMMENT[] | null;
};

/**
 * Shells out to a system `yt-dlp` binary to fetch a YouTube video's metadata
 * (title, duration, chapters) and optionally its comments — no download, no
 * YouTube Data API key (this project doesn't have one; yt-dlp uses the same
 * public endpoints the website itself does). See VIRAL_CLIPPER_YOUTUBE in
 * constants.ts for the production-availability caveat: unlike ffmpeg
 * (bundled via ffmpeg-static), this needs yt-dlp actually installed on
 * whatever host runs this.
 */
export async function fetchYoutubeMetadata(
  videoUrl: string,
  options: { withComments?: boolean; maxComments?: number } = {},
): Promise<YT_DLP_VIDEO_META> {
  const args = ["--skip-download", "--dump-single-json", "--no-warnings"];

  if (options.withComments) {
    const maxComments = options.maxComments ?? VIRAL_CLIPPER_YOUTUBE.DEFAULT_MAX_COMMENTS;
    args.push(
      "--write-comments",
      "--extractor-args",
      `youtube:comment_sort=top;max_comments=${maxComments}`,
    );
  }

  args.push(videoUrl);

  try {
    const { stdout } = await execFileAsync(VIRAL_CLIPPER_YOUTUBE.YT_DLP_BINARY, args, {
      maxBuffer: VIRAL_CLIPPER_YOUTUBE.YT_DLP_MAX_BUFFER_BYTES,
      timeout: VIRAL_CLIPPER_YOUTUBE.YT_DLP_TIMEOUT_MS,
    });
    return JSON.parse(stdout) as YT_DLP_VIDEO_META;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${VIRAL_CLIPPER_ERROR_MESSAGES.YOUTUBE_METADATA_FETCH_FAILED}: ${message}`);
  }
}

/** Formats a seconds offset as MM:SS (or H:MM:SS past an hour), matching the diarized transcript's timestamp style. */
export function formatSecondsAsTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
