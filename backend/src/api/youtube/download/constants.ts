import { resolve } from "node:path";

import { AIXEL_MEDIA } from "../../../media";

export const YOUTUBE_DOWNLOAD_MEDIA = {
  VIDEO: "video",
  AUDIO: "audio",
} as const;

/** ffmpeg merge timeout for the video path (audio is a single stream). */
export const YOUTUBE_DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;

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
    "YouTube download needs a persistent host with disk (not available on Vercel)",
  NO_CLIENTS:
    "Every InnerTube client failed for this video — it may be private, age-restricted, or removed",
  MERGE_FAILED: "ffmpeg failed to merge the downloaded video and audio streams",
  OUTPUT_MISSING: "Download finished but the output file was not found",
} as const;
