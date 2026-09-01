import { resolve } from "node:path";

import { AIXEL_MEDIA } from "../../../media";

export const YOUTUBE_DOWNLOAD_MEDIA = {
  VIDEO: "video",
  AUDIO: "audio",
} as const;

export const YOUTUBE_DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;

export const YOUTUBE_DOWNLOAD_MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export const YOUTUBE_DOWNLOAD_BINARY = process.env.YOUTUBE_YT_DLP_BIN ?? "yt-dlp";

export const YOUTUBE_DOWNLOAD_DIR = resolve(
  process.env.YOUTUBE_DOWNLOAD_DIR || AIXEL_MEDIA.YOUTUBE_DOWNLOADS,
);

export const YOUTUBE_DOWNLOAD_FIELD_DESCRIPTIONS = {
  VIDEO_ID:
    "YouTube video ID or a watch / shorts / youtu.be / embed URL. Playlist-only URLs are rejected.",
  MEDIA: `What to write to disk. "${YOUTUBE_DOWNLOAD_MEDIA.VIDEO}" (default) is a merged mp4; "${YOUTUBE_DOWNLOAD_MEDIA.AUDIO}" is m4a audio.`,
} as const;

export const YOUTUBE_DOWNLOAD_ERROR_MESSAGES = {
  INVALID_SOURCE: "Could not parse a YouTube video ID from the request",
  PLAYLIST_ONLY: "Playlist URLs are not supported — pass a single video ID or watch URL",
  VERCEL:
    "YouTube download needs a persistent host with yt-dlp and disk (not available on Vercel)",
  BINARY_MISSING: "yt-dlp is not installed on this host",
  FAILED: "yt-dlp failed to download the video",
  OUTPUT_MISSING: "yt-dlp finished but the output file was not found",
} as const;
