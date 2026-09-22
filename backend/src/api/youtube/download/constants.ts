import { AIXEL_MEDIA } from "../../../media";
import { YOUTUBE_BASE_URL } from "../constants";

export const YOUTUBE_DOWNLOAD_MEDIA = {
  VIDEO: "video",
  AUDIO: "audio",
} as const;

/** ffmpeg remux timeout for a downloaded file. */
export const YOUTUBE_DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000;

/** The downloader-website path (`site.ts`) — its browser and how long each step may take. */
export const YOUTUBE_SITE_DOWNLOAD = {
  CHROME_BIN: "/usr/bin/google-chrome-stable",
  /** The VPS's Xvfb display — headed, like the chatgpt and gemini modules, and watchable over noVNC. */
  DISPLAY: ":99",
  LAUNCH_TIMEOUT_MS: 20_000,
  CDP_TIMEOUT_MS: 30_000,
  /** Landing page load until its URL form exists. */
  PAGE_READY_TIMEOUT_MS: 45_000,
  POLL_MS: 2_000,
  /** A conversion whose progress text has not changed for this long is dead (loader.to never reports some failures). */
  CONVERT_STALL_MS: 5 * 60 * 1000,
  CONVERT_TIMEOUT_MS: 30 * 60 * 1000,
  /** From navigating to the file link until Chrome reports a download. */
  DOWNLOAD_START_TIMEOUT_MS: 60_000,
  /** A download that receives no bytes for this long is cancelled. */
  DOWNLOAD_STALL_MS: 90_000,
} as const;

export const YOUTUBE_DOWNLOAD_DIR = AIXEL_MEDIA.YOUTUBE_DOWNLOADS;

/** Title + existence check that answers the VPS's own IP (no proxy). */
export const YOUTUBE_OEMBED_URL = `${YOUTUBE_BASE_URL}/oembed`;

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
  NOT_FOUND: "YouTube says this video does not exist",
  NOT_VPS:
    "YouTube download drives a headed Chrome on an X display (the VPS's Xvfb) — no X display is available on this host",
  ALL_SITES_FAILED: "Every downloader site failed for this video",
  REMUX_FAILED: "ffmpeg could not read the downloaded file as media",
} as const;
