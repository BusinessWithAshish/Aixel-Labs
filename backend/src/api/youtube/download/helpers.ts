import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";

import { IS_VERCEL_RUNTIME } from "../../../config";
import { YOUTUBE_VIDEO_URL } from "../constants";
import { isYoutubePlaylistUrl, parseYoutubeVideoId } from "../helpers";
import {
  YOUTUBE_DOWNLOAD_BINARY,
  YOUTUBE_DOWNLOAD_DIR,
  YOUTUBE_DOWNLOAD_ERROR_MESSAGES,
  YOUTUBE_DOWNLOAD_MAX_BUFFER_BYTES,
  YOUTUBE_DOWNLOAD_MEDIA,
  YOUTUBE_DOWNLOAD_TIMEOUT_MS,
} from "./constants";
import { YoutubeDownloadError } from "./errors";
import type {
  YOUTUBE_DOWNLOAD_MEDIA_VALUE,
  YOUTUBE_VIDEO_DOWNLOAD_REQUEST,
  YOUTUBE_VIDEO_DOWNLOAD_RESPONSE,
} from "./types";

const execFileAsync = promisify(execFile);

function expectedPath(videoId: string, media: YOUTUBE_DOWNLOAD_MEDIA_VALUE): string {
  const ext = media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO ? "m4a" : "mp4";
  return join(YOUTUBE_DOWNLOAD_DIR, `${videoId}.${ext}`);
}

function mimeTypeFor(media: YOUTUBE_DOWNLOAD_MEDIA_VALUE): string {
  return media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO ? "audio/mp4" : "video/mp4";
}

export function resolveYoutubeDownloadVideoId(source: string): string {
  if (isYoutubePlaylistUrl(source) && !parseYoutubeVideoId(source)) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.PLAYLIST_ONLY, 400);
  }
  const videoId = parseYoutubeVideoId(source);
  if (!videoId) {
    throw new YoutubeDownloadError(
      YOUTUBE_DOWNLOAD_ERROR_MESSAGES.INVALID_SOURCE,
      400,
    );
  }
  return videoId;
}

async function existingDownload(
  videoId: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): Promise<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE | null> {
  const filePath = expectedPath(videoId, media);
  try {
    const info = await stat(filePath);
    if (!info.isFile() || info.size <= 0) return null;
    return {
      videoId,
      title: videoId,
      durationSeconds: 0,
      filePath,
      mimeType: mimeTypeFor(media),
      bytes: info.size,
      media,
    };
  } catch {
    return null;
  }
}

function ytDlpArgs(
  videoId: string,
  media: YOUTUBE_DOWNLOAD_MEDIA_VALUE,
): string[] {
  const outTemplate = join(YOUTUBE_DOWNLOAD_DIR, "%(id)s.%(ext)s");
  const args = [
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    "--no-overwrites",
    "-o",
    outTemplate,
    "--print",
    "%(title)s",
    "--print",
    "%(duration)s",
    "--print",
    "after_move:%(filepath)s",
  ];

  if (ffmpegPath) {
    args.push("--ffmpeg-location", ffmpegPath);
  }

  if (media === YOUTUBE_DOWNLOAD_MEDIA.AUDIO) {
    args.push("-f", "ba", "-x", "--audio-format", "m4a");
  } else {
    args.push("-f", "bv*+ba/b", "--merge-output-format", "mp4");
  }

  args.push("--", YOUTUBE_VIDEO_URL(videoId));
  return args;
}

export async function downloadYoutubeMedia(
  request: Pick<YOUTUBE_VIDEO_DOWNLOAD_REQUEST, "videoId" | "media">,
): Promise<YOUTUBE_VIDEO_DOWNLOAD_RESPONSE> {
  if (IS_VERCEL_RUNTIME) {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.VERCEL, 501);
  }

  const videoId = resolveYoutubeDownloadVideoId(request.videoId);
  const media = request.media ?? YOUTUBE_DOWNLOAD_MEDIA.VIDEO;

  const cached = await existingDownload(videoId, media);
  if (cached) return cached;

  await mkdir(YOUTUBE_DOWNLOAD_DIR, { recursive: true });

  let stdout = "";
  try {
    const result = await execFileAsync(YOUTUBE_DOWNLOAD_BINARY, ytDlpArgs(videoId, media), {
      maxBuffer: YOUTUBE_DOWNLOAD_MAX_BUFFER_BYTES,
      timeout: YOUTUBE_DOWNLOAD_TIMEOUT_MS,
    });
    stdout = result.stdout;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "ENOENT") {
      throw new YoutubeDownloadError(
        YOUTUBE_DOWNLOAD_ERROR_MESSAGES.BINARY_MISSING,
        502,
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new YoutubeDownloadError(
      `${YOUTUBE_DOWNLOAD_ERROR_MESSAGES.FAILED}: ${message}`,
      502,
    );
  }

  const lines = stdout.trim().split("\n").filter(Boolean);
  const title = lines[0]?.trim() || videoId;
  const durationSeconds = Number(lines[1]);
  const printedPath = lines[2]?.trim();
  const filePath =
    printedPath && printedPath.startsWith("/")
      ? printedPath
      : expectedPath(videoId, media);

  try {
    const info = await stat(filePath);
    return {
      videoId,
      title,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      filePath,
      mimeType: mimeTypeFor(media),
      bytes: info.size,
      media,
    };
  } catch {
    throw new YoutubeDownloadError(YOUTUBE_DOWNLOAD_ERROR_MESSAGES.OUTPUT_MISSING, 502);
  }
}
